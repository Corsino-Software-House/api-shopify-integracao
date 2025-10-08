require('dotenv').config();
const axios = require('axios');

const baseUrl = process.env.KUANTOKUSTA_API_URL;
const apiKey = process.env.KUANTOKUSTA_API_KEY;

const headers = {
  'x-api-key': apiKey,
  'Content-Type': 'application/json',
};

async function testKuantokustaAPI() {
  try {
    console.log('🔍 Testando autenticação na KuantoKusta...');
    console.log('URL:', baseUrl);
    console.log('Headers:', headers);

    const { data } = await axios.get(`${baseUrl}/kms/orders/`, { headers });
    console.log('✅ Conexão bem-sucedida!');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Erro:', error.response?.status, error.response?.data || error.message);
  }
}

testKuantokustaAPI();
