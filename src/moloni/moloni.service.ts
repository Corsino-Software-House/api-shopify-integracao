import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { URLSearchParams } from 'url';

@Injectable()
export class MoloniService {
  private readonly logger = new Logger(MoloniService.name);
  private readonly clientSecret: string;
  private readonly developerId: string;
  private readonly username: string;
  private readonly password: string;
  private readonly baseUrl = 'https://api.moloni.pt/v1';
  private readonly companyId: string;

  constructor(private readonly config: ConfigService) {
    this.clientSecret = this.config.get<string>('MOLONI_CLIENT_SECRET')!;
    this.developerId = this.config.get<string>('MOLONI_DEVELOPER_ID')!;
    this.username = this.config.get<string>('MOLONI_USER')!;
    this.password = this.config.get<string>('MOLONI_PASSWORD')!;
    this.companyId = this.config.get<string>('MOLONI_COMPANY_ID')!;

    if (!this.clientSecret || !this.developerId || !this.username || !this.password || !this.companyId) {
      throw new Error('Moloni credentials not configured!');
    }
  }

  /** --------------------------------------------------------------------
   *  1. GET ACCESS TOKEN via password flow
   * -------------------------------------------------------------------- */
  private async getAccessToken(): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: this.developerId,
      client_secret: this.clientSecret,
      username: this.username,
      password: this.password,
    });

    const url = `${this.baseUrl}/grant/?${params.toString()}`;
    this.logger.log(`\n====== 🔐 OBTENDO TOKEN ======\n➡️ GET: ${url}`);

    try {
      const res = await axios.get(url);
      this.logger.log(`🔑 Token recebido: ${res.data.access_token}`);
      return res.data.access_token;
    } catch (err: any) {
      this.logger.error('Erro ao gerar token Moloni', err.response?.data || err.message);
      throw new HttpException(
        { message: 'Erro ao gerar token Moloni', details: err.response?.data || err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** --------------------------------------------------------------------
   *  2. Criar cliente caso não exista
   * -------------------------------------------------------------------- */
  async findOrCreateCustomer(order: any): Promise<number> {
    const name = order.customerName || 'Cliente KuantoKusta';

    const token = await this.getAccessToken();
    const payload = new URLSearchParams({
      company_id: this.companyId.toString(),
      filters: JSON.stringify({ name }),
    });

    // GET clientes
    try {
      const res = await axios.post(`${this.baseUrl}/customers/getAll/?access_token=${token}`, payload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (res.data?.length > 0) return res.data[0].customer_id;
    } catch (err) {
      this.logger.warn('Erro ao buscar cliente existente, será criado um novo');
    }

    // INSERT cliente
    const payloadInsert = new URLSearchParams({
      company_id: this.companyId.toString(),
      name,
      vat: order.vatNumber || '999999990',
      address: order.address || '',
      zip_code: order.zip || '',
      city: order.city || '',
      country: order.country || 'PT',
      phone: order.phone || '',
      ...(order.email ? { email: order.email } : {}),
    });

    try {
      const res = await axios.post(`${this.baseUrl}/customers/insert/?access_token=${token}`, payloadInsert.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return res.data.customer_id;
    } catch (err: any) {
      this.logger.error('Erro ao criar cliente Moloni', err.response?.data || err.message);
      throw new HttpException(
        { message: 'Erro ao criar cliente Moloni', details: err.response?.data || err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** --------------------------------------------------------------------
   *  3. Mapear produtos para payload Moloni
   * -------------------------------------------------------------------- */

  /** --------------------------------------------------------------------
   *  4. Criar fatura (Invoice)
   * -------------------------------------------------------------------- */
async createInvoice(order: any) {
  try {
    if (!order.products || order.products.length === 0) {
      throw new Error("order.products está vazio!");
    }

    const token = await this.getAccessToken();

    // 1️⃣ Buscar document_set_id
    const dsBody = new URLSearchParams();
    dsBody.append("company_id", this.companyId.toString());

    const docSetsRes = await axios.post(
      `${this.baseUrl}/documentSets/getAll/?access_token=${token}`,
      dsBody.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const documentSetId = docSetsRes.data?.[0]?.document_set_id;
    if (!documentSetId) throw new Error("Moloni não retornou document_set_id");

    // 2️⃣ Payload base
    const body = new URLSearchParams();
    body.append("company_id", this.companyId.toString());
    body.append("customer_id", (await this.findOrCreateCustomer(order)).toString());
    body.append("document_set_id", documentSetId.toString());
    body.append("date", new Date().toISOString().split("T")[0]);

    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    body.append("expiration_date", exp.toISOString().split("T")[0]);

    body.append("status", "1");
    body.append("your_reference", order.orderId);

    // 3️⃣ Produtos
   let idx = 0;

for (const p of order.products) {
  const product = await this.findMoloniProductBySku(token, p.sellerProductId);

  if (!product) {
    throw new Error(`Produto não existe no Moloni: ${p.name} (SKU: ${p.sellerProductId})`);
  }

  const taxId = product.tax_id ?? 2657253;

  this.logger.log(`📦 Produto encontrado por SKU:`);
  this.logger.log(`➡️ Nome: ${product.name}`);
  this.logger.log(`➡️ ID: ${product.product_id}`);
  this.logger.log(`➡️ Tax ID: ${taxId}`);
  this.logger.log(`➡️ Enviando exemption_reason: M01`);

  body.append(`products[${idx}][product_id]`, String(product.product_id));
  body.append(`products[${idx}][name]`, product.name);
  body.append(`products[${idx}][qty]`, String(p.quantity));
  
  // ✅ Aqui usamos o totalPrice do pedido
  body.append(`products[${idx}][price]`, Number(order.totalPrice).toFixed(2));
  
  body.append(`products[${idx}][tax_id]`, String(taxId));
  body.append(`products[${idx}][exemption_reason]`, "M01");

  idx++;
}
    // 4️⃣ Ignorar frete
    this.logger.log("📦 Frete removido — nenhum frete será enviado para o Moloni.");

    // 5️⃣ Chamada final
    const url = `${this.baseUrl}/invoices/insert/?access_token=${token}`;

    this.logger.log("➡️ Enviando POST para:");
    this.logger.log(url);
    this.logger.debug("📦 Payload:");
    this.logger.debug(body.toString());

    const res = await axios.post(url, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!res.data?.invoice_id && !res.data?.document_id) {
      this.logger.error("❌ Moloni não criou a fatura!", res.data);
      throw new Error("Moloni não criou a fatura");
    }

    this.logger.log("🎉 FATURA CRIADA COM SUCESSO!", res.data);
    return res.data;

  } catch (err: any) {
    this.logger.error("❌ Erro ao criar fatura:", err.response?.data || err.message);
    throw err;
  }
}








async findMoloniProductBySku(token: string, sku: string) {
  this.logger.log(`🔎 [Moloni] Procurando produto pelo SKU: ${sku}`);

  const params = new URLSearchParams();
  params.append("company_id", this.companyId.toString());
  params.append("search", sku);

  try {
    const res = await axios.post(
      `${this.baseUrl}/products/getBySearch/?access_token=${token}`,
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    this.logger.debug("📄 Resposta bruta da busca:", res.data);

    if (!Array.isArray(res.data) || res.data.length === 0) {
      this.logger.warn(`⚠️ Nenhum produto encontrado com SKU: ${sku}`);
      return null;
    }

    const product = res.data[0];
    this.logger.log(`✔️ Produto encontrado: ${product.name} (ID: ${product.product_id})`);

    return product;

  } catch (err: any) {
    this.logger.error("❌ Erro ao buscar produto por SKU:", err.response?.data || err.message);
    return null;
  }
}




 async findInvoiceByOrder(orderId: string) {
  const token = await this.getAccessToken();

  const payload = new URLSearchParams();
  payload.append("company_id", String(this.companyId));
  payload.append("your_reference", orderId);
  payload.append("status", "1"); // 1 = normal (non-annulled); adjust based on exact status codes from Moloni docs

  const url = `${this.baseUrl}/documents/getAll/?access_token=${token}`;

  const response = await axios.post(url, payload, {
    headers: { 
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  return response.data?.length ? response.data[0] : null;
}
}
