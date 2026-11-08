import { expect, test } from '../../fixtures';
import { PurchasePaymentPage } from '../../pages/purchase-payment.page';

import { activeBank, createPayment, createPurchaseInvoice, createSupplier } from './arrange';

test.setTimeout(150_000);

test.describe('Purchase payment detail', () => {
  test('shows header, supplier, method, bank and allocations of a bank payment', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const bank = await activeBank(api);
    const reference = uid('UTR');
    const payment = await createPayment(api, { supplierId: supplier.id, invoiceId: invoice.id, amount: 450, reference });

    const pp = new PurchasePaymentPage(page);
    await pp.gotoView(payment.id);

    await expect(pp.viewHeading).toHaveText(payment.paymentNumber);
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await expect(page.getByText(supplier.name)).toBeVisible();
    await expect(page.getByText(`Ref: ${reference}`)).toBeVisible();
    await expect(page.getByText(bank.bankName).first()).toBeVisible();
    await expect(page.getByText('Amount Paid').first()).toBeVisible();

    const allocation = pp.allocationRow(invoice.invoiceNumber);
    await expect(allocation).toBeVisible();
    await expect(allocation).toContainText('₹450');
  });

  test('a cash payment has no bank card', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const payment = await createPayment(api, { supplierId: supplier.id, invoiceId: invoice.id, amount: 250, method: 'Cash' });

    const pp = new PurchasePaymentPage(page);
    await pp.gotoView(payment.id);

    await expect(page.locator('.method-text')).toHaveText('Cash');
    await expect(page.getByRole('heading', { name: 'Bank Account' })).toHaveCount(0);
  });

  test('an unknown payment id shows an error, not a blank page', async ({ page }) => {
    await page.goto('/purchase-payments/00000000-0000-4000-8000-000000000000/view');
    await expect(page.getByText(/Error|Not Found/).first()).toBeVisible();
  });
});
