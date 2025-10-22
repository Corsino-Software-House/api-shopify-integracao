import { Injectable, Logger, HttpStatus,HttpException } from '@nestjs/common';
import { KuantokustaService } from '../kuantokusta/kuantokusta.service';
import { ShopifyService } from '../shopify/shopify.service';
import axios from 'axios';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly kkService: KuantokustaService,
    private readonly shopifyService: ShopifyService,
  ) {}

  /**
   * 🔄 Sincroniza pedidos dos últimos 7 dias
   */
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
  let duplicatedOrders: string[] = [];

  if (!orders || orders.length === 0) {
    this.logger.warn(`Nenhum pedido encontrado na KuantoKusta (${periodo}).`);
    return { 
      statusCode: HttpStatus.NO_CONTENT, 
      message: `Nenhum pedido encontrado (${periodo}).`,
      duplicatedOrders 
    };
  }

  let syncedCount = 0;

  for (const order of orders) {
    if (!order.products?.length) continue;

    const exists = await this.shopifyService.orderExists(order.orderId);
    if (exists) {
      duplicatedOrders.push(order.orderId);
      this.logger.warn(`⏩ Pedido ${order.orderId} já existe no Shopify. Ignorando duplicação.`);
      continue;
    }

    const mappedOrder = this.mapToShopifyOrder(order);
    await this.shopifyService.createOrder(mappedOrder);
    syncedCount++;
  }

  if (duplicatedOrders.length > 0) {
    // Retorna 409 se houver **qualquer** pedido duplicado
    return {
      statusCode: HttpStatus.CONFLICT,
      message: syncedCount === 0
        ? `Todos os ${duplicatedOrders.length} pedidos já existiam no Shopify.`
        : `${syncedCount} pedidos sincronizados e ${duplicatedOrders.length} já existiam no Shopify.`,
      duplicatedOrders,
    };
  }

  // Nenhum duplicado, retorna 200
  return {
    statusCode: HttpStatus.OK,
    message: `${syncedCount} pedidos (${periodo}) sincronizados com sucesso.`,
    duplicatedOrders, // array vazio
  };
}


  /**
   * 🧩 Mapeia pedido da KuantoKusta para formato do Shopify
   */
  private mapToShopifyOrder(order: any) {
    const nameParts = (order.deliveryAddress?.customerName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    this.logger.debug(
      `Mapeando pedido: ${order.orderId}, Cliente: ${order.deliveryAddress?.customerName}`,
    );

    return {
      note: `Pedido importado da KuantoKusta - ID: ${order.orderId}`,
      line_items: (order.products || []).map((p: any) => ({
        title: p.name,
        quantity: p.quantity,
        price: p.price.toFixed(2),
        sku: p.sellerProductId || p.id,
      })),
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: order.deliveryAddress?.email || '',
        address1: order.deliveryAddress?.address1 || '',
        address2: order.deliveryAddress?.address2 || '',
        city: order.deliveryAddress?.city || '',
        zip: order.deliveryAddress?.zipCode || '',
        country: order.deliveryAddress?.country || '',
      },
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
