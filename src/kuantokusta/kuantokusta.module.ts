import { Module } from '@nestjs/common';
import { KuantokustaService } from './kuantokusta.service';

@Module({
  providers: [KuantokustaService],
  exports: [KuantokustaService],
})
export class KuantokustaModule {}
