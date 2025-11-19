import { Module } from '@nestjs/common';
import { MoloniService } from './moloni.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [MoloniService],
  exports: [MoloniService],
})
export class MoloniModule {}
