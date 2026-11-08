/** API-side arrangement for invoice/note/report specs (invoices & reports session). */
import type { ApiClient } from '../support/api-client';
import { isoDate } from '../support/data';

export interface ArrangedSalesInvoice {
  id: string;
  invoiceNumber: string;
  grandTotal: number;
  customer: { id: string; name: string };
  product: { id: string; name: string };
  itemId: string;
  qty: number;
  unitPrice: number;
}

export async function pickCustomer(api: ApiClient) {
  const res = await api.get('/customer/list', { page: 1, limit: 50 });
  const c = res.customers.find(
    (x: any) => x.isActive && !x.isBlocked && x.addresses.some((a: any) => a.addressType === 'shipping'),
  );
  if (!c) {
    throw new Error('No active customer with a shipping address in the dev DB');
  }
  return {
    id: c.id as string,
    name: c.name as string,
    shippingAddressId: c.addresses.find((a: any) => a.addressType === 'shipping').id as string,
  };
}

export async function pickProduct(api: ApiClient) {
  const res = await api.get('/product/list', { page: 1, limit: 50 });
  const p = res.products.find((x: any) => x.isActive && (x.inventory?.stockQuantity ?? 0) > 100 && x.saleRate > 0);
  if (!p) {
    throw new Error('No active in-stock product in the dev DB');
  }
  return { id: p.id as string, name: p.name as string, saleRate: Number(p.saleRate) };
}

/** Order -> confirm creates the (finalized) sales invoice, exactly as the UI flow does. */
export async function createSalesInvoice(api: ApiClient, qty = 2): Promise<ArrangedSalesInvoice> {
  const customer = await pickCustomer(api);
  const product = await pickProduct(api);
  const order = await api.post('/order', {
    customerId: customer.id,
    shippingAddressId: customer.shippingAddressId,
    orderItems: [{ productId: product.id, quantity: qty }],
    deliveryDate: isoDate(3),
    orderType: 'REGULAR',
    notes: 'e2e invoice arrange',
  });
  const confirmed = await api.patch(`/order/${order.id}/confirm`, {});
  const inv = await api.get(`/sales-invoice/${confirmed.invoiceId}`);
  return {
    id: inv.id,
    invoiceNumber: String(inv.invoiceNumber),
    grandTotal: Number(inv.grandTotal),
    customer: { id: customer.id, name: customer.name },
    product: { id: product.id, name: product.name },
    itemId: inv.invoiceItems[0].id,
    qty,
    unitPrice: Number(inv.invoiceItems[0].unitPrice),
  };
}

/**
 * Purchase invoices are created by confirming a purchase order (POST /purchase-invoice is disabled in the API).
 * `supplierBillNo` becomes the invoice's "Supplier Bill No".
 */
export async function createPurchaseInvoice(api: ApiClient, supplierBillNo: string, qty = 3, rate = 100) {
  const [suppliers, product] = [await api.get('/supplier', { limit: 50, page: 1 }), await pickProduct(api)];
  const supplier = suppliers.suppliers.find((s: any) => s.gstin && s.stateCode === 'TN');
  const po = await api.post('/purchase-orders', {
    supplierId: supplier.id,
    orderDate: isoDate(0),
    expectedDeliveryDate: isoDate(7),
    supplierInvoiceNumber: supplierBillNo,
    invoiceLevelDiscountMode: 'PERCENT',
    invoiceLevelDiscountPct: 0,
    invoiceLevelDiscountAmount: 0,
    otherCharges: 0,
    roundingOffAmount: 0,
    tdsPercentage: 0,
    isReverseCharge: false,
    orderItems: [{ productId: product.id, quantity: qty, unitPriceAgreed: rate, gstRate: 18, discountPercentage: 0, discountAmount: 0, discountPrimaryMode: 'PERCENT' }],
    serviceItems: [],
  });
  const poId = po.purchaseOrder?.id ?? po.id;
  const confirmed = await api.post(`/purchase-orders/${poId}/confirm`, {});
  const id = confirmed.purchaseInvoice?.id ?? confirmed.purchaseInvoiceId ?? confirmed.invoiceId ?? confirmed.id;
  return { id: id as string, supplier: { id: supplier.id as string, name: supplier.name as string }, product, qty, rate };
}
