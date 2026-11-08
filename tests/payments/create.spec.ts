import { expect, test } from '../../fixtures';
import { PurchasePaymentPage } from '../../pages/purchase-payment.page';

import { activeBank, bankOptionLabel, createPurchaseInvoice, createSupplier, getPurchaseInvoice } from './arrange';

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

// Arranging an invoice waits for its asynchronous ledger posting, which can take a while under load.
test.setTimeout(150_000);
// Concurrent payment creates can collide on the payment number (API answers 409), which also hits
// the UI submit when another worker records a payment at the same moment. Retry instead of masking it.
test.describe.configure({ retries: 2 });

test.describe('Record purchase payment', () => {
  test('cash payment settles part of an invoice', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const pp = new PurchasePaymentPage(page);

    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await pp.selectInvoice(invoice.invoiceNumber);
    await expect(pp.amount).toHaveValue(String(invoice.amountDue));

    await pp.fillPayment({ amount: 400, method: 'Cash' });
    // Cash needs neither a bank account nor a reference.
    await expect(pp.bankAccount).toHaveCount(0);
    await expect(pp.submit).toHaveText(/Pay\s+₹400\.00/);

    const response = await pp.submitPayment();
    expect(response.status()).toBe(201);
    await expect(pp.toast(/Payment of ₹400\.00 recorded successfully/).first()).toBeVisible();
    await expect(page).toHaveURL(/\/purchase-invoices/);

    const created = await response.json();
    const persisted = await api.get(`/payment/${created.id}`);
    expect(persisted).toMatchObject({ status: 'ACTIVE', paymentMethod: 'Cash', paymentAmount: 400, supplierId: supplier.id });
    expect(persisted.allocations).toHaveLength(1);
    expect(persisted.allocations[0]).toMatchObject({ purchaseInvoiceId: invoice.id, amountAllocated: 400 });

    const after = await api.get(`/purchase-invoice/${invoice.id}`);
    expect(after.accountsPayableStatus).toBe('PARTIAL_PAID');
    expect(Number(after.amountDue)).toBe(invoice.amountDue - 400);
  });

  test('bank transfer clears the invoice and records bank and reference', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const bank = await activeBank(api);
    const reference = uid('UTR');
    const pp = new PurchasePaymentPage(page);

    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await pp.selectInvoice(invoice.invoiceNumber);
    await pp.fillPayment({ method: 'Bank Transfer', bank: bankOptionLabel(bank), reference });
    await expect(pp.submit).toHaveText(new RegExp(`Pay\\s+₹1,180\\.00`));

    const response = await pp.submitPayment();
    expect(response.status()).toBe(201);
    await expect(pp.toast(/recorded successfully/).first()).toBeVisible();

    const created = await response.json();
    const persisted = await api.get(`/payment/${created.id}`);
    expect(persisted).toMatchObject({
      paymentMethod: 'Bank Transfer',
      referenceNumber: reference,
      bankAccountId: bank.id,
      paymentAmount: invoice.amountDue,
    });

    const after = await getPurchaseInvoice(api, invoice.id);
    expect(after.amountDue).toBe(0);
    expect((await api.get(`/purchase-invoice/${invoice.id}`)).accountsPayableStatus).toBe('PAID');

    // The detail screen shows the same voucher.
    await pp.gotoView(created.id);
    await expect(pp.viewHeading).toHaveText(created.paymentNumber);
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await expect(page.getByText(`Ref: ${reference}`)).toBeVisible();
    await expect(page.getByText(bank.bankName).first()).toBeVisible();
    await expect(pp.allocationRow(invoice.invoiceNumber)).toBeVisible();
  });

  test('a payment larger than one invoice is allocated across selected invoices', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const first = await createPurchaseInvoice(api, supplier.id, uid('SB'), 10);
    const second = await createPurchaseInvoice(api, supplier.id, uid('SB'), 5);
    const bank = await activeBank(api);
    const pp = new PurchasePaymentPage(page);
    const totalDue = first.amountDue + second.amountDue;
    const paying = first.amountDue + 100;

    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await pp.selectInvoice(first.invoiceNumber);
    await pp.selectInvoice(second.invoiceNumber);
    await pp.fillPayment({ amount: paying, method: 'UPI', bank: bankOptionLabel(bank), reference: uid('UPI') });

    const preview = page.getByText('Allocation Preview (FIFO)');
    await expect(preview).toBeVisible();
    await expect(page.locator('tfoot')).toContainText(inr(paying));

    const response = await pp.submitPayment();
    expect(response.status()).toBe(201);
    const created = await response.json();

    const persisted = await api.get(`/payment/${created.id}`);
    const allocated = (persisted.allocations as Array<{ amountAllocated: number }>).reduce(
      (sum, a) => sum + Number(a.amountAllocated),
      0,
    );
    expect(allocated).toBe(paying);

    const a = await api.get(`/purchase-invoice/${first.id}`);
    const b = await api.get(`/purchase-invoice/${second.id}`);
    expect([a.accountsPayableStatus, b.accountsPayableStatus].sort()).toEqual(['PAID', 'PARTIAL_PAID']);
    expect(Number(a.amountDue) + Number(b.amountDue)).toBe(totalDue - paying);

    await pp.gotoView(created.id);
    await expect(page.locator('.allocation-row')).toHaveCount(2);
  });

  test('opened from an invoice, the amount is pre-filled and paying clears it', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const bank = await activeBank(api);
    const pp = new PurchasePaymentPage(page);

    await pp.gotoNewForInvoice(invoice.id);
    await expect(page.getByText(invoice.invoiceNumber)).toBeVisible();
    await expect(pp.amount).toHaveValue(String(invoice.amountDue));

    await pp.fillPayment({ method: 'Cheque', bank: bankOptionLabel(bank), reference: uid('CHQ') });
    const response = await pp.submitPayment();
    expect(response.status()).toBe(201);

    expect(Number((await api.get(`/purchase-invoice/${invoice.id}`)).amountDue)).toBe(0);
    const created = await response.json();
    expect((await api.get(`/payment/${created.id}`)).paymentMethod).toBe('Cheque');
  });

  test('a supplier with nothing outstanding shows an empty state', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const pp = new PurchasePaymentPage(page);

    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await expect(page.getByText('No outstanding invoices or bills for this supplier.')).toBeVisible();
    await expect(pp.amount).toHaveCount(0);
  });
});

test.describe('Record purchase payment: validation', () => {
  test('non-cash methods flag the missing reference and bank inline', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const pp = new PurchasePaymentPage(page);

    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await pp.selectInvoice(invoice.invoiceNumber);
    await pp.method.selectOption('Bank Transfer');
    await pp.reference.focus();
    await pp.reference.blur();
    // The primary company bank is pre-selected; clearing it must be flagged.
    await expect(pp.bankAccount).not.toHaveValue('');
    await pp.bankAccount.selectOption('');
    await pp.bankAccount.blur();

    await expect(page.getByText('Reference number is required.')).toBeVisible();
    await expect(page.getByText('Bank account is required.')).toBeVisible();
  });

  // UI convention (ecommerce-bolt/.github/copilot-instructions.md): never disable submit for
  // validation; clicking it must reveal the errors. The screen disables the button instead.
  test('submitting an incomplete form shows the errors instead of a disabled button', async ({ page, api, uid }) => {
    test.fail(true, 'BUG: submit is disabled while the form is invalid; there is no submitted state or error summary');
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const pp = new PurchasePaymentPage(page);

    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await pp.selectInvoice(invoice.invoiceNumber);
    await pp.method.selectOption('Bank Transfer');

    await expect(pp.submit).toBeEnabled({ timeout: 2_000 });
    await pp.submit.click();
    await expect(page.getByText('Reference number is required.')).toBeVisible();
  });

  test('no payment is created when the form is incomplete', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const pp = new PurchasePaymentPage(page);

    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await pp.selectInvoice(invoice.invoiceNumber);
    await expect(pp.method).toHaveValue('');
    await expect(pp.submit).toBeDisabled();

    const payments = await api.get(`/payment/invoice/${invoice.id}`);
    expect(payments).toEqual([]);
  });
});
