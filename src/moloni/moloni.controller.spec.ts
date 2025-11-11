import { Test, TestingModule } from '@nestjs/testing';
import { MoloniController } from './moloni.controller';

describe('MoloniController', () => {
  let controller: MoloniController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MoloniController],
    }).compile();

    controller = module.get<MoloniController>(MoloniController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
