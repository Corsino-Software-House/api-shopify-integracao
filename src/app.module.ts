import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KuantokustaModule } from './kuantokusta/kuantokusta.module';
import { ShopifyModule } from './shopify/shopify.module';
import { SyncService } from './sync/sync.service';
import { SyncController } from './sync/sync.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MoloniController } from './moloni/moloni.controller';
import { MoloniService } from './moloni/moloni.service';
import { MoloniModule } from './moloni/moloni.module';




@Module({
  imports: [KuantokustaModule, ShopifyModule,ConfigModule.forRoot({ isGlobal: true }),ScheduleModule.forRoot(), MoloniModule],
  controllers: [AppController, SyncController, MoloniController],
  providers: [AppService, SyncService, MoloniService ],
})
export class AppModule {}
