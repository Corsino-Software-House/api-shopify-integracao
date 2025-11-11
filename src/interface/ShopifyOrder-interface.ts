export interface ShopifyOrder {
  note: string;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  };
  shipping_address: {
    address1: string;
    address2?: string;
    city: string;
    zip: string;
    country: string;
  };
  billing_address: {
    address1: string;
    address2?: string;
    city: string;
    zip: string;
    country: string;
  };
  line_items: {
    variant_id: number;
    quantity: number;
  }[];
  financial_status: string;
  currency: string;
  total_price: string;
  shipping_lines: {
    title: string;
    price: string;
    code: string;
  }[];
  tags: string[];
}