import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class KuantokustaService {
  private readonly logger = new Logger(KuantokustaService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('KUANTOKUSTA_API_URL')!;
    this.apiKey = this.configService.get<string>('KUANTOKUSTA_API_KEY')!;

    if (!this.baseUrl) {
      throw new Error('KUANTOKUSTA_API_URL não definida');
    }
    if (!this.apiKey) {
      throw new Error('KUANTOKUSTA_API_KEY não definida');
    }
  }

  private get headers() {
    return { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' };
  }

  async getOrders() {
    try {
      this.logger.log(`Buscando pedidos em ${this.baseUrl}/kms/orders`);
      const { data } = await axios.get(`${this.baseUrl}/kms/orders`, { headers: this.headers });
      this.logger.log(`Total de pedidos recebidos: ${data?.length || 0}`);
      return data;
    } catch (error: any) {
      this.logger.error(
        'Erro ao buscar pedidos da KuantoKusta',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async updateShipment(orderId: string, tracking: any) {
    try {
      this.logger.log(`Atualizando expedição de pedido ${orderId}`);
      const { data } = await axios.post(
        `${this.baseUrl}/kms/orders/${orderId}/send`,
        tracking,
        { headers: this.headers },
      );
      return data;
    } catch (error: any) {
      this.logger.error(
        'Erro ao atualizar expedição',
        error.response?.data || error.message,
      );
      throw error;
    }
  }
}
