require('dotenv').config();
const axios = require('axios');

const baseUrl = process.env.KUANTOKUSTA_API_URL;
const apiKey = process.env.KUANTOKUSTA_API_KEY;

const headers = {
  'x-api-key': apiKey,
  'Content-Type': 'application/json',
};

async function main() {
  console.log('🔍 Testando KuantoKusta Sandbox API');
  console.log('URL:', baseUrl);
  console.log('API Key:', apiKey ? '✅ carregada' : '❌ faltando');
  console.log('-----------------------------------\n');

  try {
    // 1️⃣ Listar pedidos existentes (pode retornar vazio)
    console.log('📦 Listando pedidos...');
    const { data: orders } = await axios.get(`${baseUrl}/kms/orders`, { headers });
    console.log('✅ Resposta recebida:\n', JSON.stringify(orders, null, 2));

    // 2️⃣ Criar um novo pedido de teste
    console.log('\n🧾 Criando pedido de teste...');
    const newOrder = {
      reference: 'TESTE-' + Date.now(),
      currency: 'EUR',
      total: 29.9,
      customer: {
        name: 'Cliente Sandbox',
        email: 'cliente@teste.pt',
        phone: '912345678',
      },
      items: [
        {
          sku: 'SKU12345',
          name: 'Produto Teste',
          price: 29.9,
          quantity: 1,
        },
      ],
      shipping_address: {
        address: 'Rua Exemplo 123',
        city: 'Lisboa',
        postal_code: '1000-000',
        country: 'PT',
      },
    };

    const { data: created } = await axios.post(`${baseUrl}/kms/orders`, newOrder, { headers });
    console.log('✅ Pedido criado com sucesso:\n', JSON.stringify(created, null, 2));

  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data || error.message;
    console.error(`\n❌ Erro [${status || 'sem status'}]:`, JSON.stringify(data, null, 2));
  }
}

main();
