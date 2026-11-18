import { expect } from '@playwright/test';

import type { ApiClient } from '../../support/api-client';
import { isoDate } from '../../support/data';

export interface ArrangedCustomer {
  id: string;
  name: string;
  addressId: string;
}

export interface ArrangedSalesInvoice {
  id: string;
  invoiceNumber: string;
  grandTotal: number;
  amountDue: number;
}

export async function createCustomer(api: ApiClient, name: string, mobile: string): Promise<ArrangedCustomer> {
  const address = (addressType: string) => ({
    addressType,
    addressLine1: 'E2E Street',
    city: 'Chennai',
    state: '33',
    pincode: '600001',
  });
  const groups = await api.get('/freight/business-groups');
  const list = Array.isArray(groups) ? groups : (groups.items ?? groups.data ?? groups.groups ?? []);
  const data = {
    businessGroupId: list[0].id,
    customerType: 'individual',
    name,
    mobileNumber: mobile,
    addresses: [address('billing'), address('shipping')],
  };
  // Concurrent customer creates hit a unique-key race in the API (409); retry (see bug report).
  let c: any;
  for (let attempt = 1; ; attempt += 1) {
    const res = await api.raw().post('/customer', { data });
    if (res.status() === 409 && attempt < 6) {
      continue;
    }
    expect(res.ok(), `POST /customer -> ${res.status()} ${await res.text()}`).toBeTruthy();
    c = await res.json();
    break;
  }
  const full = await api.get(`/customer/${c.id}`);
  const shipping = (full.addresses ?? []).find((a: any) => a.addressType === 'shipping') ?? full.addresses?.[0];
  return { id: c.id, name, addressId: shipping.id };
}

/** Confirmed sales order -> sales invoice for one product. */
export async function createSalesInvoice(
  api: ApiClient,
  customer: ArrangedCustomer,
  quantity = 2,
): Promise<ArrangedSalesInvoice> {
  // Specs receive/allocate up to ₹1,000 and expect part-payments, so the invoice must be well above that
  // whatever the environment's prices are: size the quantity from the product's rate.
  const products = await api.get('/product/list', { page: 1, limit: 50 });
  // Only products whose stock covers the needed quantity qualify; take the one with the most headroom,
  // since parallel specs draw down the same shared stock.
  const need = (x: any) => Math.max(quantity, Math.ceil(2500 / Number(x.saleRate)));
  const stockOf = (x: any) => Number(x.inventory?.stockQuantity ?? 0);
  const product = products.products
    .filter((x: any) => x.isActive && Number(x.saleRate) > 0 && stockOf(x) >= need(x))
    .sort((a: any, b: any) => stockOf(b) / need(b) - stockOf(a) / need(a))[0];
  if (!product) {
    throw new Error('No active product has enough stock for a ₹2,500 invoice');
  }
  const productId = product.id as string;
  quantity = need(product);
  const order = await api.post('/order', {
    customerId: customer.id,
    shippingAddressId: customer.addressId,
    orderItems: [{ productId, quantity }],
    notes: 'E2E arranged order',
    deliveryDate: isoDate(1),
    orderType: 'REGULAR',
  });
  const confirmed = await api.patch(`/order/${order.id}/confirm`, {});
  const invoiceId = (confirmed.salesInvoiceId ?? confirmed.invoiceId ?? confirmed.id) as string;
  return getSalesInvoice(api, invoiceId);
}

export async function getSalesInvoice(api: ApiClient, id: string): Promise<ArrangedSalesInvoice> {
  const inv = await api.get(`/sales-invoice/${id}`);
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    grandTotal: Number(inv.grandTotal),
    amountDue: Number(inv.amountDue ?? inv.grandTotal),
  };
}

export async function waitForInvoicePosted(api: ApiClient, invoiceId: string): Promise<void> {
  await expect.poll(async () => (await getSalesInvoice(api, invoiceId)).amountDue, { timeout: 30_000 }).toBeGreaterThan(0);
}

/** A bank-only helper: the primary active company bank. */
export async function activeBank(api: ApiClient): Promise<{ id: string; bankName: string; accountNumber: string }> {
  const banks = await api.get<any[]>('/company/banks');
  const bank = banks.find((b) => b.isActive && b.isPrimary) ?? banks.find((b) => b.isActive);
  if (!bank) {
    throw new Error('No active company bank configured');
  }
  return bank;
}

export function bankOptionLabel(bank: { bankName: string; accountNumber: string }): string {
  return `${bank.bankName} ···${bank.accountNumber.slice(-4)}`;
}

/** Creates a receipt through the API, retrying if a concurrent create takes the same receipt number (409). */
export async function createReceipt(
  api: ApiClient,
  opts: { customerId: string; invoiceId: string; amount: number; method?: string; reference?: string; bankId?: string },
) {
  const method = opts.method ?? 'Cash';
  const data = {
    customerId: opts.customerId,
    // A full ISO timestamp makes the API answer 500 (see bug report); the UI sends a plain date.
    receiptDate: isoDate(),
    paymentMethod: method,
    referenceNumber: opts.reference,
    shopBankId: opts.bankId ?? (await activeBank(api)).id,
    allocations: [{ salesInvoiceId: opts.invoiceId, amount: opts.amount }],
  };
  for (let attempt = 1; ; attempt += 1) {
    const res = await api.raw().post('/receipt', { data });
    if (res.status() === 409 && attempt < 5) {
      continue;
    }
    expect(res.ok(), `POST /receipt -> ${res.status()} ${await res.text()}`).toBeTruthy();
    return res.json();
  }
}

/** Unique 10-digit mobile number for a new customer. */
export function uniqueMobile(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}
