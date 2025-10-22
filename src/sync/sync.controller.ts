import { Controller, Get, Param, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SyncService } from './sync.service';

@ApiTags('Sincronização')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('daily')
  @ApiOperation({ summary: 'Sincroniza pedidos diários da KuantoKusta com o Shopify' })
  @ApiResponse({ status: 200, description: 'Pedidos diários sincronizados com sucesso.' })
  @ApiResponse({ status: 204, description: 'Nenhum pedido encontrado para sincronização diária.' })
  @ApiResponse({ status: 409, description: 'Alguns pedidos já existiam no Shopify e foram ignorados.' })
  async runSync() {
    const result = await this.syncService.syncOrders();

    if (result.statusCode === HttpStatus.NO_CONTENT) return { message: result.message, duplicatedOrders: result.duplicatedOrders };
    if (result.statusCode === HttpStatus.CONFLICT)
      throw new HttpException(
        { message: result.message, duplicatedOrders: result.duplicatedOrders },
        HttpStatus.CONFLICT,
      );

    return { message: result.message, duplicatedOrders: result.duplicatedOrders };
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Sincroniza pedidos semanais da KuantoKusta com o Shopify' })
  @ApiResponse({ status: 200, description: 'Pedidos semanais sincronizados com sucesso.' })
  @ApiResponse({ status: 204, description: 'Nenhum pedido encontrado para sincronização semanal.' })
  @ApiResponse({ status: 409, description: 'Alguns pedidos já existiam no Shopify e foram ignorados.' })
  async syncWeekly() {
    const result = await this.syncService.syncWeeklyOrders();

    if (result.statusCode === HttpStatus.NO_CONTENT) return { message: result.message, duplicatedOrders: result.duplicatedOrders };
    if (result.statusCode === HttpStatus.CONFLICT)
      throw new HttpException(
        { message: result.message, duplicatedOrders: result.duplicatedOrders },
        HttpStatus.CONFLICT,
      );

    return { message: result.message, duplicatedOrders: result.duplicatedOrders };
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Sincroniza pedidos mensais da KuantoKusta com o Shopify' })
  @ApiResponse({ status: 200, description: 'Pedidos mensais sincronizados com sucesso.' })
  @ApiResponse({ status: 204, description: 'Nenhum pedido encontrado para sincronização mensal.' })
  @ApiResponse({ status: 409, description: 'Alguns pedidos já existiam no Shopify e foram ignorados.' })
  async syncMonthly() {
    const result = await this.syncService.syncMonthlyOrders();

    if (result.statusCode === HttpStatus.NO_CONTENT) return { message: result.message, duplicatedOrders: result.duplicatedOrders };
    if (result.statusCode === HttpStatus.CONFLICT)
      throw new HttpException(
        { message: result.message, duplicatedOrders: result.duplicatedOrders },
        HttpStatus.CONFLICT,
      );

    return { message: result.message, duplicatedOrders: result.duplicatedOrders };
  }

  /**
   * 🚚 Sincroniza expedição de pedido da Shopify para a KuantoKusta
   */
  @Get('shipment/:orderId')
  @ApiOperation({ summary: 'Sincroniza expedição (fulfillment) da Shopify com a KuantoKusta' })
  @ApiParam({ name: 'orderId', description: 'ID do pedido na Shopify', example: 1234567890 })
  @ApiResponse({ status: 200, description: 'Expedição sincronizada com sucesso.' })
  @ApiResponse({ status: 204, description: 'Nenhuma expedição encontrada para o pedido informado.' })
  @ApiResponse({ status: 500, description: 'Erro ao sincronizar expedição.' })
  async syncShipment(@Param('orderId') orderId: number) {
    const result = await this.syncService.syncShipmentFromShopify(orderId);

    if (result.statusCode === HttpStatus.NO_CONTENT)
      return { message: result.message };

    if (result.statusCode === HttpStatus.INTERNAL_SERVER_ERROR)
      throw new HttpException(
        { message: result.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

    return result;
  }
}
