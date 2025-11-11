import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { KuantoKustaOrder } from '../interface/KuantoKusta-interface';
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
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'KUANTOKUSTA_API_URL não definida',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!this.apiKey) {
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'KUANTOKUSTA_API_KEY não definida',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private get headers() {
    return { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' };
  }

  /**
   * Método genérico para buscar pedidos entre duas datas
   */
  private async fetchOrdersBetween(start: Date, end: Date, label: string) {
    try {
      const createdAt_gte = start.toISOString();
      const createdAt_lte = end.toISOString();
      const url = `${this.baseUrl}/kms/orders?createdAt_gte=${createdAt_gte}&createdAt_lte=${createdAt_lte}`;

      this.logger.log(`Buscando pedidos (${label}) entre ${createdAt_gte} e ${createdAt_lte}`);

      const { data } = await axios.get(url, { headers: this.headers });

      this.logger.log(`Total de pedidos (${label}): ${data?.length || 0}`);
      return data;
    } catch (error: any) {
      const details = error.response?.data || error.message;

      this.logger.error(`Erro ao buscar pedidos (${label})`, details);

      throw new HttpException(
        {
          statusCode: error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message: `Erro ao buscar pedidos (${label})`,
          details,
        },
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Busca pedidos dos últimos 7 dias
   */
  /**
 * Busca pedidos do dia atual
 */
async getOrders() : Promise<KuantoKustaOrder[]> {
  try {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    return await this.fetchOrdersBetween(startOfDay, endOfDay, 'dia atual');
  } catch (error) {
    throw error;
  }
}


  /**
   * Busca pedidos da semana atual (segunda até hoje)
   */
  async getWeeklyOrders() {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = domingo, 1 = segunda...
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const firstDayOfWeek = new Date(today);
      firstDayOfWeek.setDate(today.getDate() - diff);
      firstDayOfWeek.setHours(0, 0, 0, 0);

      return await this.fetchOrdersBetween(firstDayOfWeek, today, 'semana atual');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Busca pedidos do mês atual (1º dia até hoje)
   */
  async getMonthlyOrders() {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      firstDayOfMonth.setHours(0, 0, 0, 0);

      return await this.fetchOrdersBetween(firstDayOfMonth, today, 'mês atual');
    } catch (error) {
      throw error;
    }
  }
 
  /**
   * Atualiza expedição de um pedido
   */
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
      const details = error.response?.data || error.message;

      this.logger.error('Erro ao atualizar expedição', details);

      throw new HttpException(
        {
          statusCode: error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erro ao atualizar expedição',
          details,
        },
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
