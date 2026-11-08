import { expect } from '@playwright/test';

import { isoDate } from '../../support/data';
import type { ApiClient } from '../../support/api-client';

export interface ArrangedSupplier {
  id: string;
  name: string;
}

export interface ArrangedPurchaseInvoice {
  id: string;
  invoiceNumber: string;
  netPayable: number;
  amountDue: number;
}

export async function createSupplier(api: ApiClient, name: string): Promise<ArrangedSupplier> {
  // Concurrent creates can hit a unique-key race in the API (409); retry.
  for (let attempt = 1; ; attempt += 1) {
    const res = await api.raw().post('/supplier', { data: { name, stateCode: '33' } });
    if (res.status() === 409 && attempt < 6) {
      continue;
    }
    expect(res.ok(), `POST /supplier -> ${res.status()} ${await res.text()}`).toBeTruthy();
    const s = await res.json();
    return { id: s.id, name: s.name };
  }
}

/** Confirmed purchase order -> purchase invoice (intrastate, one 18% product). */
export async function createPurchaseInvoice(
  api: ApiClient,
  supplierId: string,
  ref: string,
  quantity = 10,
): Promise<ArrangedPurchaseInvoice> {
  const products = await api.get('/product/list', { page: 1, pageSize: 1 });
  const productId = products.products[0].id as string;
  const order = await api.post('/purchase-orders', {
    supplierId,
    orderDate: isoDate(),
    expectedDeliveryDate: isoDate(7),
    transportName: 'E2E Transport',
    vehicleNumber: 'TN01AB0001',
    ewayBillNumber: '',
    brokerName: '',
    supplierInvoiceNumber: ref,
    invoiceLevelDiscountMode: 'PERCENT',
    invoiceLevelDiscountPct: 0,
    invoiceLevelDiscountAmount: 0,
    otherCharges: 0,
    roundingOffAmount: 0,
    tdsPercentage: 0,
    isReverseCharge: false,
    orderItems: [{ productId, quantity, unitPriceAgreed: 100, gstRate: 18, discountPercentage: 0, discountAmount: 0 }],
    serviceItems: [],
  });
  const confirmed = await api.post(`/purchase-orders/${order.id}/confirm`, {});
  const invoiceId = (confirmed.purchaseInvoice?.id ?? confirmed.purchaseInvoiceId ?? confirmed.invoiceId ?? confirmed.id) as string;
  const invoice = await getPurchaseInvoice(api, invoiceId);
  await waitForLedgerPosting(api, supplierId, invoice.invoiceNumber);
  return invoice;
}

/**
 * Invoice posting to the supplier ledger is asynchronous (seconds, longer under load);
 * the API refuses payments until the invoice has been posted.
 */
export async function waitForLedgerPosting(api: ApiClient, supplierId: string, invoiceNumber: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const statement = await api.get(`/supplier-ledger/supplier/${supplierId}/statement`);
        return (statement.items as Array<{ referenceNumber: string }>).some((e) => e.referenceNumber === invoiceNumber);
      },
      { message: `ledger posting of ${invoiceNumber}`, timeout: 90_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
}

export async function getPurchaseInvoice(api: ApiClient, id: string): Promise<ArrangedPurchaseInvoice> {
  const inv = await api.get(`/purchase-invoice/${id}`);
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    netPayable: Number(inv.netPayable ?? inv.grandTotal),
    amountDue: Number(inv.amountDue ?? inv.netPayable ?? inv.grandTotal),
  };
}

export async function activeBank(api: ApiClient): Promise<{ id: string; bankName: string; accountNumber: string }> {
  const banks = await api.get<any[]>('/company/banks');
  const bank = banks.find((b) => b.isActive && b.isPrimary) ?? banks.find((b) => b.isActive);
  if (!bank) {
    throw new Error('No active company bank configured');
  }
  return bank;
}

/** Option text of a company bank in the UI's Bank Account select. */
export function bankOptionLabel(bank: { bankName: string; accountNumber: string }): string {
  return `${bank.bankName} ···${bank.accountNumber.slice(-4)}`;
}

/**
 * Creates a payment through the API. Concurrent creations can collide on the payment number
 * (API returns 409 DUPLICATE_ENTRY), so retry a few times.
 */
export async function createPayment(
  api: ApiClient,
  opts: {
    supplierId: string;
    invoiceId: string;
    amount: number;
    method?: string;
    reference?: string;
    bankId?: string;
  },
) {
  const method = opts.method ?? 'Bank Transfer';
  const data = {
    supplierId: opts.supplierId,
    paymentDate: isoDate(),
    totalAmount: opts.amount,
    paymentMethod: method,
    referenceNumber: opts.reference,
    bankAccountId: method === 'Cash' ? undefined : (opts.bankId ?? (await activeBank(api)).id),
    allocations: [{ invoiceId: opts.invoiceId, amount: opts.amount }],
  };
  for (let attempt = 1; ; attempt += 1) {
    const res = await api.raw().post('/payment', { data });
    if (res.status() === 409 && attempt < 5) {
      continue;
    }
    expect(res.ok(), `POST /payment -> ${res.status()} ${await res.text()}`).toBeTruthy();
    return res.json();
  }
}
