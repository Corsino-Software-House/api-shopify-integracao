import { Test, TestingModule } from '@nestjs/testing';
import { KuantokustaService } from './kuantokusta.service';

describe('KuantokustaService', () => {
  let service: KuantokustaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KuantokustaService],
    }).compile();

    service = module.get<KuantokustaService>(KuantokustaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
