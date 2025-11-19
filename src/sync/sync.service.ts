import { Injectable, Logger, HttpStatus,HttpException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KuantokustaService } from '../kuantokusta/kuantokusta.service';
import { ShopifyService } from '../shopify/shopify.service';
import {ShopifyOrder} from '../interface/ShopifyOrder-interface';
import { KuantoKustaOrder } from '../interface/KuantoKusta-interface';
import { MoloniService } from '../moloni/moloni.service';
import axios from 'axios';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
   private isSyncRunning = false;
   private isOrderStateUpdateRunning = false;

  constructor(
    private readonly kkService: KuantokustaService,
    private readonly shopifyService: ShopifyService,
    private readonly moloniService: MoloniService,
  ) {}

  /**
   * 🔄 Sincroniza pedidos dos últimos 7 dias
   */
   @Cron(CronExpression.EVERY_MINUTE)
async handleCronSync() {
  if (this.isSyncRunning) {
    this.logger.warn('⚠️ Sincronização já em execução. Ignorando nova chamada.');
    return;
  }

  this.isSyncRunning = true;
  this.logger.log('⏰ Iniciando sincronização automática de pedidos...');

  try {
    const result = await this.syncOrders();
    this.logger.log(`✅ Sincronização concluída: ${result.message}`);
  } catch (err) {
    this.logger.error('❌ Erro durante sincronização automática', err);
  } finally {
    this.isSyncRunning = false;
  }
}

@Cron(CronExpression.EVERY_5_MINUTES)
async handleOrderStateUpdate() {
  if (this.isOrderStateUpdateRunning) {
    this.logger.warn('⚠️ Atualização de status já em execução. Ignorando.');
    return;
  }

  this.isOrderStateUpdateRunning = true;
  this.logger.log('🔁 Atualizando status dos pedidos existentes...');

  try {
    const orders = await this.kkService.getOrders();

    for (const order of orders) {
      if (!order.orderId || !order.orderState) continue;

      // 1️⃣ Atualizar o status no Shopify (já existe)
      await this.shopifyService.updateOrderStatusFromKuantoKusta(
        order.orderId,
        order.orderState,
      );

      // 2️⃣ Criar fatura NO MOLONI quando aprovado
      // 2️⃣ Criar fatura NO MOLONI quando aprovado
if (order.orderState === 'Approved') {
  try {

    // 🔍 VERIFICAÇÃO: já existe fatura no Moloni?
    const existingInvoice = await this.moloniService.findInvoiceByOrder(order.orderId);

    if (existingInvoice) {
      this.logger.warn(
        `⚠️ Fatura Moloni já existente para o pedido ${order.orderId}. Não será criada outra.`
      );
      continue; // impede duplicação
    }

    // 🔧 Se não existir, cria a fatura normalmente
    this.logger.log(`🧾 Criando fatura Moloni para pedido ${order.orderId}...`);
    await this.moloniService.createInvoice(order);

    this.logger.log(
      `✅ Fatura Moloni criada com sucesso para pedido ${order.orderId}`
    );

  } catch (err: any) {
    this.logger.error(
      `❌ Falha ao criar fatura Moloni do pedido ${order.orderId}: ${err.message}`,
    );
  }
}

    }

    this.logger.log('✅ Atualização de status concluída.');
  } catch (err) {
    this.logger.error('Erro ao atualizar status dos pedidos:', err);
  } finally {
    this.isOrderStateUpdateRunning = false;
  }
}



  async syncOrders() {
    const orders = await this.kkService.getOrders();
    return this.processOrders(orders, 'Dia atual');
  }

  async syncWeeklyOrders() {
    const orders = await this.kkService.getWeeklyOrders();
    return this.processOrders(orders, 'semana atual');
  }

  async syncMonthlyOrders() {
    const orders = await this.kkService.getMonthlyOrders();
    return this.processOrders(orders, 'mês atual');
  }

private async processOrders(orders: any[], periodo: string) {
  const duplicatedOrders: string[] = [];
  const notFoundSKUs: string[] = [];
  let syncedCount = 0;

  if (!orders?.length) {
    this.logger.warn(`Nenhum pedido encontrado na KuantoKusta (${periodo}).`);
    return this.buildResponse(HttpStatus.NO_CONTENT, periodo, 0, [], []);
  }

  for (const order of orders) {
    if (!order.products?.length) continue;

    if (await this.shopifyService.orderExists(order.orderId)) {
      duplicatedOrders.push(order.orderId);
      this.logger.warn(`⏩ Pedido ${order.orderId} já existe no Shopify.`);
      continue;
    }

    const lineItems: { variant_id: number; quantity: number; price: string }[] = [];

    for (const p of order.products) {
      const sku = p.sellerProductId || p.id;

      try {
        const productData = await this.shopifyService.findProductBySKU(sku);

        if (!productData) {
          this.logger.warn(`❌ SKU ${sku} não encontrado na Shopify.`);
          notFoundSKUs.push(sku);
          continue;
        }

        const variantId = Number(
          productData.variantId?.split('/').pop() // extrai o ID numérico do gid://
        );

        if (!Number.isFinite(variantId)) {
          this.logger.warn(`⚠️ Produto encontrado, mas ID inválido (${sku}).`);
          notFoundSKUs.push(sku);
          continue;
        }

        lineItems.push({
          variant_id: variantId,
          quantity: Number(p.quantity) || 1,
          price: (Number(p.price) || 0).toFixed(2),
        });

        this.logger.log(`🔎 SKU ${sku} → variant_id ${variantId}`);
      } catch (err: any) {
        this.logger.error(`Erro ao processar SKU ${sku}: ${err.message}`);
        notFoundSKUs.push(sku);
      }
    }

    if (!lineItems.length) {
      this.logger.warn(`❌ Nenhum SKU válido no pedido ${order.orderId}. Ignorando.`);
      continue;
    }

    try {
      const mappedOrder = this.mapKuantokustaToShopify(order);
      mappedOrder.line_items = lineItems;

      await this.shopifyService.createOrder(mappedOrder);
      syncedCount++;
      this.logger.log(`✅ Pedido ${order.orderId} sincronizado (${lineItems.length} item(s)).`);
    } catch (err: any) {
      this.logger.error(`❌ Falha ao criar pedido ${order.orderId}: ${err.message}`);
    }
  }

  return this.buildResponse(HttpStatus.OK, periodo, syncedCount, duplicatedOrders, notFoundSKUs);
}


// 🔹 Helper para simplificar o retorno
private buildResponse(
  statusCode: number,
  periodo: string,
  synced: number,
  duplicated: string[],
  notFound: string[],
) {
  const parts: string[] = [];
  if (synced) parts.push(`${synced} pedidos sincronizados`);
  if (duplicated.length) parts.push(`${duplicated.length} já existiam`);
  if (notFound.length) parts.push(`${notFound.length} SKUs não encontrados`);

  return {
    statusCode,
    message: parts.length
      ? `${parts.join(', ')}. (${periodo})`
      : `Nenhum pedido sincronizado (${periodo}).`,
    duplicatedOrders: duplicated,
    notFoundSKUs: notFound,
  };
}



  /**
   * 🧩 Mapeia pedido da KuantoKusta para formato do Shopify
   */
 private mapKuantokustaToShopify(order: KuantoKustaOrder): ShopifyOrder {
  const nameParts = (order.deliveryAddress?.customerName || '').trim().split(' ');
  const firstName = nameParts.shift() || '';
  const lastName = nameParts.join(' ') || '';

  // Valida o e-mail
  const rawEmail = (order as any).deliveryAddress?.email || '';
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
  const safeEmail = isValidEmail ? rawEmail : `kk_${order.orderId}@kuantokusta.fake`;

  this.logger.debug(
    `Mapeando pedido: ${order.orderId}, Cliente: ${order.deliveryAddress?.customerName}`,
  );

  return {
    note: `Pedido importado da KuantoKusta - ID: ${order.orderId}`,
    customer: {
      first_name: firstName,
      last_name: lastName,
      email: safeEmail,
    },
    shipping_address: {
      address1: order.deliveryAddress?.address1 || '',
      address2: order.deliveryAddress?.address2 || '',
      city: order.deliveryAddress?.city || '',
      zip: order.deliveryAddress?.zipCode || '',
      country: order.deliveryAddress?.country || '',
      // usamos type casting aqui pra Shopify aceitar
      ...(order.deliveryAddress?.customerName && { name: order.deliveryAddress.customerName }),
      ...(order.deliveryAddress?.contact && { phone: order.deliveryAddress.contact }),
    } as any,
    billing_address: {
      address1: order.billingAddress?.address1 || '',
      address2: order.billingAddress?.address2 || '',
      city: order.billingAddress?.city || '',
      zip: order.billingAddress?.zipCode || '',
      country: order.billingAddress?.country || '',
      ...(order.billingAddress?.customerName && { name: order.billingAddress.customerName }),
      ...(order.billingAddress?.contact && { phone: order.billingAddress.contact }),
    } as any,
    line_items: [],
    financial_status: 'pending',
    currency: 'EUR',
    total_price: order.totalPrice?.toFixed(2) || '0.00',
    shipping_lines: order.shipping
      ? [
          {
            title: order.shipping.type,
            price: order.shipping.value.toFixed(2),
            code: order.shipping.type,
          },
        ]
      : [],
    tags: ['KuantoKusta', `KK-${order.orderId}`],
  };
}




   async syncShipmentFromShopify(orderId: number) {
    try {
      this.logger.log(`🔄 Iniciando sincronização de expedição para o pedido ${orderId}...`);

      // 1️⃣ Busca fulfillment na Shopify
      const fulfillmentUrl = `${process.env.SHOPIFY_API_URL}/orders/${orderId}/fulfillments.json`;
      const response = await axios.get(fulfillmentUrl, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
          'Content-Type': 'application/json',
        },
      });

      const fulfillments = response.data?.fulfillments || [];
      if (fulfillments.length === 0) {
        this.logger.warn(`Nenhuma expedição encontrada para o pedido ${orderId}`);
        return {
          statusCode: HttpStatus.NO_CONTENT,
          message: `Nenhuma expedição encontrada para o pedido ${orderId}`,
        };
      }

      const fulfillment = fulfillments[0];
      const shipmentPayload = {
        trackingNumber: fulfillment.tracking_number,
        trackingUrl: fulfillment.tracking_url,
        carrier: fulfillment.tracking_company || 'Desconhecido',
        status: fulfillment.status || 'shipped',
      };

      // 2️⃣ Envia expedição para KuantoKusta
      const kuantoResponse = await this.kkService.updateShipment(`KK-${orderId}`, shipmentPayload);

      this.logger.log(`✅ Expedição sincronizada com sucesso para pedido ${orderId}`);

      return {
        statusCode: HttpStatus.OK,
        message: 'Expedição sincronizada com sucesso',
        orderId,
        shipmentPayload,
        kuantoResponse,
      };
    } catch (error: any) {
      const details = error.response?.data || error.message;
      this.logger.error(`Erro ao sincronizar expedição do pedido ${orderId}`, details);

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: `Erro ao sincronizar expedição do pedido ${orderId}`,
          details,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
