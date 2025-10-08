import { Controller, Get } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('test')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('sync')
  async runSync() {
    return this.syncService.syncOrders();
  }
}
