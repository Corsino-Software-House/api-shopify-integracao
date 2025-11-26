import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private readonly baseUrl = process.env.SHOPIFY_API_URL!;
  private readonly graphqlUrl = `${this.baseUrl}/graphql.json`;
  private readonly token = process.env.SHOPIFY_ACCESS_TOKEN!;

  private get headers() {
    return {
      'X-Shopify-Access-Token': this.token,
      'Content-Type': 'application/json',
    };
  }

async createOrder(order: any) {
  try {
    const response = await axios.post(`${this.baseUrl}/orders.json`, { order }, { headers: this.headers });
    return response.data;
  } catch (error: any) {
    const details = JSON.stringify(error.response?.data, null, 2);
    this.logger.error(`Erro ao criar pedido na Shopify:\n${details}`);
    throw error;
  }
}


  async createProduct(productData: any) {
  try {
    const { data } = await axios.post(
      `${this.baseUrl}/products.json`,
      { product: productData },
      { headers: this.headers }
    );
    this.logger.log(`🆕 Produto criado na Shopify: ${data.product.title} (ID: ${data.product.id})`);
    return data.product;
  } catch (error) {
    this.logger.error('❌ Erro ao criar produto na Shopify', error.message);
    throw error;
  }
}


  async updateFulfillment(orderId: number, tracking: any) {
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/orders/${orderId}/fulfillments.json`,
        { fulfillment: tracking },
        { headers: this.headers },
      );
      return data;
    } catch (error) {
      this.logger.error('Erro ao atualizar expedição na Shopify', error.message);
      throw error;
    }
  }

  async orderExists(orderId: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/orders.json?status=any&tag=KK-${orderId}`;
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': this.token,
        },
      });
      return response.data.orders && response.data.orders.length > 0;
    } catch (error) {
      this.logger.error(`Erro ao verificar pedido ${orderId}: ${error.message}`);
      return false;
    }
  }

async findProductBySKU(sku: string) {
  try {
    const query = `
      query ProductVariantBySku {
        productVariants(first: 1, query: "sku:${sku}") {
          edges {
            node {
              id
              sku
              title
              product {
                id
                title
                vendor
                handle
                status
              }
            }
          }
        }
      }
    `;

    const { data } = await axios.post(
      `${this.baseUrl}/graphql.json`,
      { query },
      { headers: this.headers }
    );

    const edges = data?.data?.productVariants?.edges;
    if (!edges?.length) {
      this.logger.warn(`SKU ${sku} não encontrado na Shopify.`);
      return null;
    }

    const node = edges[0].node;
    const product = node.product;

    return {
      id: product.id,
      title: product.title,
      vendor: product.vendor,
      handle: product.handle,
      status: product.status,
      sku: node.sku,
      variantId: node.id,
      variantTitle: node.title,
    };
  } catch (error: any) {
    this.logger.error(
      `Erro ao buscar SKU ${sku} no Shopify: ${error.response?.data || error.message}`
    );
    return null;
  }
}

private async markOrderAsPaid(orderGid: string) {
  const query = `
    query GetOrderFinancialStatus($id: ID!) {
      node(id: $id) {
        ... on Order {
          id
          name
          displayFinancialStatus
        }
      }
    }
  `;

  const mutation = `
    mutation MarkOrderPaid($input: OrderMarkAsPaidInput!) {
      orderMarkAsPaid(input: $input) {
        order {
          id
          name
          displayFinancialStatus
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    // 1. Busca o status atual do pedido
    const statusResponse = await axios.post(
      this.graphqlUrl,
      {
        query,
        variables: { id: orderGid },
      },
      { headers: this.headers }
    );

    const orderNode = statusResponse.data.data?.node;

    if (!orderNode) {
      throw new Error('Pedido não encontrado ou ID inválido no Shopify.');
    }

    const currentStatus = orderNode.displayFinancialStatus;

    this.logger.debug(
      `Pedido ${orderNode.name} (${orderGid}) está com status financeiro: ${currentStatus}`
    );

    // 2. Verifica se já está pago (total ou parcialmente – ajuste conforme sua regra de negócio)
    if (currentStatus === 'PAID' || currentStatus === 'PARTIALLY_PAID') {
      this.logger.log(
        `Pedido ${orderNode.name} já está marcado como ${currentStatus}. Nada a fazer.`
      );
      return; // Sai sem erro
    }

    // 3. Se ainda não está pago, executa a mutation
    const mutationResponse = await axios.post(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          input: { id: orderGid },
        },
      },
      { headers: this.headers }
    );

    this.logger.debug(
      `Resposta Shopify MarkAsPaid RAW: ${JSON.stringify(mutationResponse.data, null, 2)}`
    );

    const result = mutationResponse.data.data?.orderMarkAsPaid;
    const errors = result?.userErrors;
    const order = result?.order;

    if (errors?.length) {
      throw new Error(`Erro ao marcar como pago: ${errors.map((e: any) => e.message).join(', ')}`);
    }

    if (!order) {
      throw new Error('Shopify não retornou o objeto "order" após marcar como pago.');
    }

    this.logger.log(
      `Pedido ${order.name} (${order.id}) marcado como pago com sucesso. Status atual: ${order.displayFinancialStatus}`
    );
  } catch (error: any) {
    const details = error.response?.data || error.message;
    this.logger.error(`Erro ao marcar pedido como pago (${orderGid}): ${JSON.stringify(details)}`);
    throw error; // opcional: re-throw se quiser que o erro suba
  }
}


private async markOrderAsFulfilled(orderGid: string) {
  const mutation = `
    mutation FulfillOrder($orderId: ID!) {
      fulfillmentCreateV2(fulfillment: {
        lineItemsByFulfillmentOrder: [
          { fulfillmentOrderId: $orderId }
        ],
        notifyCustomer: true
      }) {
        fulfillment {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const { data } = await axios.post(
    this.graphqlUrl,
    { query: mutation, variables: { orderId: orderGid } },
    { headers: this.headers }
  );

  const response = data?.data?.fulfillmentCreateV2;
  const errors = response?.userErrors;

  if (errors?.length) {
    throw new Error(`❌ Erro ao marcar como enviado: ${errors.map(e => e.message).join(', ')}`);
  }

  this.logger.log(`📦 Pedido ${orderGid} marcado como enviado.`);
  this.logger.debug(`🧩 Resposta completa do Shopify: ${JSON.stringify(response, null, 2)}`);
}

private async cancelShopifyOrder(orderGid: string) {
  const mutation = `
    mutation CancelOrder($orderId: ID!) {
      orderCancel(orderId: $orderId) {
        order {
          id
          canceledAt
          displayFinancialStatus
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const { data } = await axios.post(
    this.graphqlUrl,
    { query: mutation, variables: { orderId: orderGid } },
    { headers: this.headers }
  );

  const errors = data.data?.orderCancel?.userErrors;
  if (errors?.length) {
    throw new Error(`Erro ao cancelar pedido: ${errors.map(e => e.message).join(', ')}`);
  }

  this.logger.log(`🚫 Pedido ${orderGid} cancelado na Shopify.`);
}



async updateOrderStatusFromKuantoKusta(orderId: string, orderState: string) {
  try {
    this.logger.log(`🔄 Atualizando status do pedido KK-${orderId} (${orderState})...`);

    // 1️⃣ Busca o pedido na Shopify usando GraphQL (pelo tag "KK-{id}")
    const query = `
      query GetOrderByTag($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              displayFinancialStatus
              fulfillmentOrders(first: 1) {
                nodes {
                  id
                  status
                }
              }
            }
          }
        }
      }
    `;

    const { data } = await axios.post(
      this.graphqlUrl,
      { query, variables: { query: `tag:KK-${orderId}` } },
      { headers: this.headers }
    );

    const edges = data.data?.orders?.edges || [];
    if (!edges.length) {
      this.logger.warn(`❌ Pedido KK-${orderId} não encontrado na Shopify.`);
      return;
    }

    const orderNode = edges[0].node;
    const shopifyOrderId = orderNode.id;
    const fulfillmentOrderId = orderNode.fulfillmentOrders?.nodes?.[0]?.id;

    // 2️⃣ Mapeia o estado vindo da KuantoKusta
    switch (orderState.toLowerCase()) {
      case 'approved':
        await this.markOrderAsPaid(shopifyOrderId);
        break;
      case 'waiting approval':
        await this.markOrderAsPaid(shopifyOrderId);
        break;

      case 'waiting payment':
        this.logger.log(`🕓 Pedido KK-${orderId} aguardando aprovação.`);
        break;

      case 'canceled':
        await this.cancelShopifyOrder(shopifyOrderId);
        break;

      case 'shipped':
      case 'In Transit':
        if (!fulfillmentOrderId) {
          this.logger.warn(`⚠️ Pedido KK-${orderId} não possui fulfillmentOrderId disponível.`);
          return;
        }
        await this.markOrderAsFulfilled(fulfillmentOrderId);
        break;

      default:
        this.logger.log(`⚠️ Estado ${orderState} não requer atualização.`);
        break;
    }

    this.logger.log(`✅ Pedido KK-${orderId} atualizado com sucesso (${orderState}).`);
  } catch (error: any) {
    const details = error.response?.data || error.message;
    this.logger.error(`❌ Erro ao atualizar pedido KK-${orderId}: ${details}`);
  }
}






}

