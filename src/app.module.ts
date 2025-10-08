import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KuantokustaModule } from './kuantokusta/kuantokusta.module';
import { ShopifyModule } from './shopify/shopify.module';
import { SyncService } from './sync/sync.service';
import { SyncController } from './sync/sync.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';


@Module({
  imports: [KuantokustaModule, ShopifyModule,ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController, SyncController],
  providers: [AppService, SyncService],
})
export class AppModule {}
