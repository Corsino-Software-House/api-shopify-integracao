import { Test, TestingModule } from '@nestjs/testing';
import { MoloniService } from './moloni.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MoloniService', () => {
  let service: MoloniService;

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'MOLONI_CLIENT_SECRET') return 'test-secret';
      if (key === 'MOLONI_DEVELOPER_ID') return 'test-developer';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoloniService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<MoloniService>(MoloniService);
  });

  // -------------------------------------------------------
  // 1. GET ACCESS TOKEN
  // -------------------------------------------------------
  it('deve gerar token corretamente', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'abc123' },
    });

    const token = await (service as any).getAccessToken();
    expect(token).toBe('abc123');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.moloni.pt/v1/grant/?grant_type=client_credentials',
      {
        client_id: 'test-developer',
        client_secret: 'test-secret',
      }
    );
  });

  // -------------------------------------------------------
  // 2. authedPost chama getAccessToken e o endpoint correto
  // -------------------------------------------------------
  it('deve chamar authedPost com token', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({
        data: { access_token: 'xyz-token' },
      })
      .mockResolvedValueOnce({
        data: { success: true },
      });

    const result = await (service as any).authedPost('test/path', { hello: 1 });

    expect(result).toEqual({ success: true });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.moloni.pt/v1/test/path',
      { hello: 1 },
      {
        headers: { Authorization: 'Bearer xyz-token' },
      }
    );
  });

  // -------------------------------------------------------
  // 3. findOrCreateCustomer
  // -------------------------------------------------------
  it('deve retornar cliente existente', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'tok' } }) // token
      .mockResolvedValueOnce({
        data: [{ customer_id: 55 }],
      });

    const order = { customerName: 'John Doe' };

    const result = await service.findOrCreateCustomer(order);

    expect(result).toBe(55);
  });

  it('deve criar novo cliente se não existir', async () => {
  mockedAxios.post
    .mockResolvedValueOnce({ data: { access_token: 'tok1' } }) // token para buscar
    .mockResolvedValueOnce({ data: [] })                         // busca retorna nada
    .mockResolvedValueOnce({ data: { access_token: 'tok2' } })  // token para criar cliente
    .mockResolvedValueOnce({ data: { customer_id: 999 } });     // cliente criado

  const order = {
    customerName: 'New Client',
    vatNumber: '123123123',
    address: 'Rua Teste, 123',
    zip: '1000-000',
    city: 'Lisboa',
    country: 'PT'
  };

  const result = await service.findOrCreateCustomer(order);
  expect(result).toBe(999);
});
  // -------------------------------------------------------
  // 4. createInvoiceFromKK
  // -------------------------------------------------------
  it('deve criar fatura corretamente', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'tok' } }) // token search customer
      .mockResolvedValueOnce({ data: [{ customer_id: 10 }] })   // found customer
      .mockResolvedValueOnce({ data: { access_token: 'tok' } }) // token invoice
      .mockResolvedValueOnce({ data: { document_id: 777 } });   // invoice created

    const order: any = {
      customerName: 'Client',
      items: [
        { name: 'Product 1', quantity: 2, price: 10.5 },
      ],
    };

    const invoice = await service.createInvoiceFromKK(order);

    expect(invoice.document_id).toBe(777);
  });
});
