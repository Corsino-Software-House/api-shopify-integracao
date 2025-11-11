import { Test, TestingModule } from '@nestjs/testing';
import { MoloniService } from './moloni.service';

describe('MoloniService', () => {
  let service: MoloniService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MoloniService],
    }).compile();

    service = module.get<MoloniService>(MoloniService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
