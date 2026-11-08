import { expect, test } from '../../fixtures';
import { ReceiptPage } from '../../pages/receipt.page';

import {
  activeBank,
  bankOptionLabel,
  createCustomer,
  createSalesInvoice,
  getSalesInvoice,
  uniqueMobile,
} from './arrange';

test.setTimeout(90_000);

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

test.describe('Record receipt', () => {
  test('cash receipt settles part of an invoice', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const rp = new ReceiptPage(page);

    await rp.gotoNew();
    await rp.pickCustomer(customer.name);
    await rp.selectInvoice(invoice.invoiceNumber);
    await expect(rp.amount).toHaveValue(String(invoice.amountDue));

    await rp.fillPayment({ amount: 1000, method: 'Cash' });
    // Cash needs neither a reference nor a bank.
    await expect(rp.reference).toHaveCount(0);
    await expect(rp.bank).toHaveCount(0);
    await expect(rp.submit).toHaveText(/Pay\s+₹1,000\.00/);

    const response = await rp.submitReceipt();
    expect(response.status()).toBe(201);
    await expect(rp.successAlert).toContainText('Payment recorded successfully');
    await expect(page).toHaveURL(/\/receipt$/);

    const created = await response.json();
    const persisted = await api.get(`/receipt/${created.id}`);
    expect(persisted).toMatchObject({ status: 'ACTIVE', paymentMethod: 'Cash', receiptAmount: 1000, customerId: customer.id });
    expect(persisted.allocations).toHaveLength(1);
    expect(persisted.allocations[0]).toMatchObject({ salesInvoiceId: invoice.id, amountAllocated: 1000 });

    const after = await api.get(`/sales-invoice/${invoice.id}`);
    expect(after.paymentStatus).toBe('PARTIAL_PAID');
    expect(Number(after.amountDue)).toBe(invoice.amountDue - 1000);
  });

  test('UPI receipt records reference and bank and clears the invoice', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const bank = await activeBank(api);
    const reference = uid('UPI');
    const rp = new ReceiptPage(page);

    await rp.gotoNew();
    await rp.pickCustomer(customer.name);
    await rp.selectInvoice(invoice.invoiceNumber);
    await rp.fillPayment({ method: 'UPI', reference, bank: bankOptionLabel(bank) });
    await expect(rp.submit).toHaveText(new RegExp(`Pay\\s+₹${inr(invoice.amountDue).replace('.', '\\.')}`));

    const response = await rp.submitReceipt();
    expect(response.status()).toBe(201);
    await expect(rp.successAlert).toBeVisible();

    const created = await response.json();
    const persisted = await api.get(`/receipt/${created.id}`);
    expect(persisted).toMatchObject({
      paymentMethod: 'UPI',
      referenceNumber: reference,
      shopBankId: bank.id,
      receiptAmount: invoice.amountDue,
    });

    const after = await api.get(`/sales-invoice/${invoice.id}`);
    expect(after.paymentStatus).toBe('PAID');
    expect(Number(after.amountDue)).toBe(0);

    await rp.gotoView(created.id);
    await expect(rp.viewHeading).toHaveText(created.receiptNumber);
    await expect(page.getByText(`Ref: ${reference}`)).toBeVisible();
    await expect(rp.allocationRow(invoice.invoiceNumber)).toContainText('PAID');
  });

  test('one receipt is allocated across several selected invoices', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const first = await createSalesInvoice(api, customer, 2);
    const second = await createSalesInvoice(api, customer, 1);
    const rp = new ReceiptPage(page);
    const paying = Math.min(first.amountDue, second.amountDue) + 100;

    await rp.gotoNew();
    await rp.pickCustomer(customer.name);
    await rp.selectInvoice(first.invoiceNumber);
    await rp.selectInvoice(second.invoiceNumber);
    await expect(page.getByText(/2 selected/)).toBeVisible();
    await rp.fillPayment({ amount: paying, method: 'Cash' });

    const response = await rp.submitReceipt();
    expect(response.status()).toBe(201);
    const created = await response.json();

    const persisted = await api.get(`/receipt/${created.id}`);
    const allocated = (persisted.allocations as Array<{ amountAllocated: number }>).reduce(
      (sum, a) => sum + Number(a.amountAllocated),
      0,
    );
    expect(allocated).toBe(paying);

    const a = await getSalesInvoice(api, first.id);
    const b = await getSalesInvoice(api, second.id);
    expect(a.amountDue + b.amountDue).toBe(first.amountDue + second.amountDue - paying);

    await rp.gotoView(created.id);
    await expect(page.locator('.allocation-row')).toHaveCount(persisted.allocations.length);
  });

  test('opened from an invoice link, the invoice is selected and the amount pre-filled', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const rp = new ReceiptPage(page);

    await rp.gotoNewForInvoice(customer.id, invoice.id);
    await expect(rp.invoiceRow(invoice.invoiceNumber).getByRole('checkbox')).toBeChecked();
    await expect(rp.amount).toHaveValue(String(invoice.amountDue));

    await rp.fillPayment({ method: 'Cash' });
    const response = await rp.submitReceipt();
    expect(response.status()).toBe(201);
    expect(Number((await api.get(`/sales-invoice/${invoice.id}`)).amountDue)).toBe(0);
  });

  test('paying more than the invoice asks to confirm the advance', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const rp = new ReceiptPage(page);
    const total = invoice.amountDue + 500;

    await rp.gotoNew();
    await rp.pickCustomer(customer.name);
    await rp.selectInvoice(invoice.invoiceNumber);
    await rp.fillPayment({ amount: total, method: 'Cash' });
    await rp.submit.click();

    await expect(page.getByRole('heading', { name: 'Advance Payment Detected' })).toBeVisible();
    await expect(page.locator('.modal-body')).toContainText('₹500.00');

    const response = await rp.afterResponse('POST', /\/receipt$/, () =>
      page.getByRole('button', { name: 'Confirm & Create Receipt' }).click(),
    );
    expect(response.status()).toBe(201);

    const created = await response.json();
    const persisted = await api.get(`/receipt/${created.id}`);
    expect(persisted.receiptAmount).toBe(total);
    const settled = (persisted.allocations as Array<{ salesInvoiceId: string | null; amountAllocated: number }>).find(
      (a) => a.salesInvoiceId === invoice.id,
    );
    expect(settled?.amountAllocated).toBe(invoice.amountDue);
    expect(Number((await api.get(`/sales-invoice/${invoice.id}`)).amountDue)).toBe(0);
  });

  test('cancelling the advance confirmation records nothing', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const rp = new ReceiptPage(page);

    await rp.gotoNew();
    await rp.pickCustomer(customer.name);
    await rp.selectInvoice(invoice.invoiceNumber);
    await rp.fillPayment({ amount: invoice.amountDue + 100, method: 'Cash' });
    await rp.submit.click();
    await page.locator('.modal-footer').getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'Advance Payment Detected' })).toHaveCount(0);
    const receipts = await api.get('/receipt/list', { search: customer.name });
    expect(receipts.total).toBe(0);
  });
});

test.describe('Record receipt: validation', () => {
  test('submitting an empty form stays enabled and shows an error summary plus inline errors', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const rp = new ReceiptPage(page);

    await rp.gotoNew();
    await rp.pickCustomer(customer.name);
    await rp.selectInvoice(invoice.invoiceNumber);
    await expect(rp.submit).toBeEnabled();
    await rp.submit.click();

    await expect(rp.formError).toContainText('Please fill all required fields');
    await expect(page.getByText('Payment method is required')).toBeVisible();

    const receipts = await api.get('/receipt/list', { search: customer.name });
    expect(receipts.total).toBe(0);
  });

  test('a non-cash method requires a reference', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const rp = new ReceiptPage(page);

    await rp.gotoNew();
    await rp.pickCustomer(customer.name);
    await rp.selectInvoice(invoice.invoiceNumber);
    await rp.method.selectOption('UPI');
    await rp.submit.click();

    await expect(page.getByText('Reference number is required')).toBeVisible();
    await expect(rp.formError).toContainText('Please fill all required fields');
  });

  test('a zero amount is rejected', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const rp = new ReceiptPage(page);

    await rp.gotoNew();
    await rp.pickCustomer(customer.name);
    await rp.selectInvoice(invoice.invoiceNumber);
    await rp.fillPayment({ amount: 0, method: 'Cash' });
    await rp.submit.click();

    await expect(page.getByText('Amount must be greater than 0')).toBeVisible();
  });
});
