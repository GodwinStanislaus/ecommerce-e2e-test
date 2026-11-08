import { expect, test } from '../../fixtures';
import { PurchasePaymentPage } from '../../pages/purchase-payment.page';

import { createPayment, createPurchaseInvoice, createSupplier } from './arrange';

test.setTimeout(150_000);

test.describe('Purchase payments list', () => {
  test('loads the list with search and the Record Payment action', async ({ page }) => {
    const pp = new PurchasePaymentPage(page);
    const list = pp.afterResponse('GET', '/payment/list', () => pp.goto('/purchase-payments'));
    expect((await list).status()).toBe(200);

    await expect(pp.search).toBeVisible();
    await expect(pp.recordPaymentButton).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Payment #' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Supplier' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toBeVisible();
  });

  test('shows a recorded payment with supplier, invoice, method, reference and amount', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const reference = uid('UTR');
    const payment = await createPayment(api, {
      supplierId: supplier.id,
      invoiceId: invoice.id,
      amount: 300,
      reference,
    });

    const pp = new PurchasePaymentPage(page);
    await pp.gotoList();
    await pp.searchFor(supplier.name);

    const row = pp.rowContaining(supplier.name);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(payment.paymentNumber);
    await expect(row).toContainText(invoice.invoiceNumber);
    await expect(row).toContainText('Bank Transfer');
    await expect(row).toContainText(reference);
    await expect(row).toContainText('₹300.00');
  });

  test('search narrows the list and shows an empty state when nothing matches', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    await createPayment(api, { supplierId: supplier.id, invoiceId: invoice.id, amount: 100, method: 'Cash' });

    const pp = new PurchasePaymentPage(page);
    await pp.gotoList();
    await pp.searchFor(supplier.name);
    await expect(pp.tableRows()).toHaveCount(1);

    await pp.searchFor(`no-such-supplier-${uid('X')}`);
    await expect(pp.emptyState).toBeVisible();
  });

  test('Record Payment opens the create screen', async ({ page }) => {
    const pp = new PurchasePaymentPage(page);
    await pp.gotoList();
    await pp.recordPaymentButton.click();
    await expect(page).toHaveURL(/\/purchase-payments\/new$/);
    await expect(page.getByRole('heading', { name: 'Record Purchase Payment' })).toBeVisible();
  });

  test('the view action opens the payment detail', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Sup'));
    const invoice = await createPurchaseInvoice(api, supplier.id, uid('SB'));
    const payment = await createPayment(api, { supplierId: supplier.id, invoiceId: invoice.id, amount: 200, method: 'Cash' });

    const pp = new PurchasePaymentPage(page);
    await pp.gotoList();
    await pp.searchFor(supplier.name);
    await pp.rowContaining(supplier.name).getByTitle('View payment').click();

    await expect(page).toHaveURL(new RegExp(`/purchase-payments/${payment.id}/view`));
    await expect(pp.viewHeading).toHaveText(payment.paymentNumber);
  });
});
