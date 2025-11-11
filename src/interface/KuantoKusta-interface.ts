export interface KuantoKustaOrder {
  orderId: string;

  deliveryAddress: KuantoKustaAddress;
  billingAddress: KuantoKustaAddress;

  products: KuantoKustaProduct[];

  additionalInfo?: string;
  productsPrice: number;
  totalPrice: number;
  deliveryTime?: number;

  shipping: {
    type: string;
    value: number;
  };

  approvalDate?: string;
  shippedDate?: string;
  cancelDate?: string;
  createdAt: string;
  updatedAt?: string;

  orderState: string;

  commission?: {
    totalValue: number;
  };
}

export interface KuantoKustaAddress {
  customerName: string;
  address1: string;
  address2?: string;
  zipCode: string;
  city: string;
  country: string;
  contact?: string;
  vat?: string;
  servicePoint?: KuantoKustaServicePoint;
}

export interface KuantoKustaServicePoint {
  id?: string;
  harmonisedId?: string;
  psfKey?: string;
  name?: string;
  keyword?: string;
}

export interface KuantoKustaProduct {
  name: string;
  sellerProductId: string;
  id: string;
  quantity: number;
  price: number;
}
