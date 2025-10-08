import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private readonly baseUrl = process.env.SHOPIFY_API_URL!;
  private readonly token = process.env.SHOPIFY_ACCESS_TOKEN!;

  private get headers() {
    return {
      'X-Shopify-Access-Token': this.token,
      'Content-Type': 'application/json',
    };
  }

  async createOrder(orderData: any) {
    try {
      const { data } = await axios.post(`${this.baseUrl}/orders.json`, { order: orderData }, { headers: this.headers });
      return data;
    } catch (error) {
      this.logger.error('Erro ao criar pedido na Shopify', error.message);
      throw error;
    }
  }

  async updateFulfillment(orderId: number, tracking: any) {
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/orders/${orderId}/fulfillments.json`,
        { fulfillment: tracking },
        { headers: this.headers },
      );
      return data;
    } catch (error) {
      this.logger.error('Erro ao atualizar expedição na Shopify', error.message);
      throw error;
    }
  }
}
