import { Injectable, Logger } from '@nestjs/common';
import { KuantokustaService } from '../kuantokusta/kuantokusta.service';
import { ShopifyService } from '../shopify/shopify.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly kkService: KuantokustaService,
    private readonly shopifyService: ShopifyService,
  ) {}

  async syncOrders() {
    const orders = await this.kkService.getOrders();
    if (!orders || orders.length === 0) {
      this.logger.warn('Nenhum pedido encontrado na KuantoKusta');
      return;
    }

   for (const order of orders) {
  if (!order.products || order.products.length === 0) {
    this.logger.warn(`Pedido ${order.orderId || '[sem orderId]'} não possui produtos, será ignorado.`);
    continue;
  }

  const mappedOrder = this.mapToShopifyOrder(order);
  await this.shopifyService.createOrder(mappedOrder);
  this.logger.log(`✅ Pedido ${order.orderId} sincronizado com Shopify`);
}
    return { message: `${orders.length} pedidos sincronizados com sucesso.` };

  }

private mapToShopifyOrder(order: any) {
  // Divide o nome completo em first_name e last_name
  const nameParts = (order.deliveryAddress?.customerName).split(' ');
  const firstName = nameParts[0] ;
  const lastName = nameParts.slice(1).join(' ');



  // Log para debug
  console.log(`Mapeando pedido: ${order.orderId}, Cliente: ${order.deliveryAddress?.customerName}`);

  return {
    line_items: (order.products || []).map((p: any) => ({
      title: p.name,
      quantity: p.quantity,
      price: p.price.toFixed(2),
      sku: p.sellerProductId || p.id,
    })),
    customer: {
      first_name: firstName,
      last_name: lastName,
      address1: order.deliveryAddress?.address1 || '',
      address2: order.deliveryAddress?.address2 || '',
      city: order.deliveryAddress?.city || '',
      zip: order.deliveryAddress?.zipCode || '',
      country: order.deliveryAddress?.country || '',
    },
    financial_status: 'pending',
    currency: 'EUR',
    total_price: order.totalPrice?.toFixed(2) || '0.00',
    shipping_lines: order.shipping ? [{
      title: order.shipping.type,
      price: order.shipping.value.toFixed(2),
      code: order.shipping.type,
    }] : [],
  };
}




}
