import { PurchaseInvoicePage } from '../../pages/purchase-invoice.page';
import { parseMoney } from '../../support/data';
import { createPurchaseInvoice, pickProduct } from '../_arrange';
import { expect, test } from '../../fixtures';

test.describe('Purchase invoices', () => {
  let pip: PurchaseInvoicePage;

  test.beforeEach(({ page }) => {
    pip = new PurchaseInvoicePage(page);
  });

  test('list shows the payment-status tabs and table columns', async ({ page }) => {
    await pip.gotoList();
    for (const tab of [pip.tabUnpaid, pip.tabPartial, pip.tabPaid, pip.tabAll]) {
      await expect(tab).toBeVisible();
    }
    for (const col of ['Invoice No', 'Supplier Bill No', 'Supplier', 'Net Payable', 'Due Date', 'Status', 'Actions']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }
  });

  test('an arranged invoice is found by supplier bill number with supplier, amount and unpaid status', async ({ api, uid }) => {
    const bill = uid('PB');
    const inv = await createPurchaseInvoice(api, bill, 3, 100);
    const saved = await api.get(`/purchase-invoice/${inv.id}`);

    await pip.gotoList();
    await pip.afterResponse('GET', '/purchase-invoice/list', () => pip.search.fill(bill));
    const row = pip.rowByBill(bill);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(inv.supplier.name);
    await expect(row).toContainText('Unpaid');
    expect(parseMoney(await row.getByRole('cell').nth(4).innerText())).toBe(Number(saved.netPayable));
  });

  test('status tabs filter by payment status', async ({ api, uid }) => {
    const bill = uid('PB');
    await createPurchaseInvoice(api, bill);
    await pip.gotoList();
    await pip.afterResponse('GET', '/purchase-invoice/list', () => pip.search.fill(bill));

    await pip.afterResponse('GET', '/purchase-invoice/list', () => pip.tabPaid.click());
    await expect(pip.rowByBill(bill)).toHaveCount(0);

    await pip.afterResponse('GET', '/purchase-invoice/list', () => pip.tabUnpaid.click());
    await expect(pip.rowByBill(bill)).toHaveCount(1);

    await pip.afterResponse('GET', '/purchase-invoice/list', () => pip.tabAll.click());
    await expect(pip.rowByBill(bill)).toHaveCount(1);
  });

  test('searching for an unknown bill number lists nothing', async ({ uid }) => {
    await pip.gotoList();
    await pip.afterResponse('GET', '/purchase-invoice/list', () => pip.search.fill(uid('NOPE')));
    await expect(pip.tableRows()).toHaveCount(0);
  });

  test('opens the view from the list and shows lines, GST split and net payable', async ({ api, uid, page }) => {
    const bill = uid('PB');
    const inv = await createPurchaseInvoice(api, bill, 4, 250);
    const saved = await api.get(`/purchase-invoice/${inv.id}`);

    await pip.gotoList();
    await pip.afterResponse('GET', '/purchase-invoice/list', () => pip.search.fill(bill));
    await pip.rowByBill(bill).getByRole('link').first().click();

    await expect(page).toHaveURL(new RegExp(`/purchase-invoices/${inv.id}$`));
    await expect(page.getByText(saved.invoiceNumber).first()).toBeVisible();
    await expect(page.getByText(inv.supplier.name).first()).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(inv.product.name) }).first()).toBeVisible();
    const grand = await page.getByRole('row', { name: /^Grand Total/ }).innerText();
    expect(parseMoney(grand)).toBe(Number(saved.netPayable));
    await expect(pip.recordPayment).toBeVisible();
    await expect(pip.correct).toBeVisible();
  });

  test('Record Payment opens the payment screen for that invoice', async ({ api, uid, page }) => {
    const inv = await createPurchaseInvoice(api, uid('PB'));
    await pip.gotoView(inv.id);
    await pip.recordPayment.click();
    await expect(page).toHaveURL(new RegExp(`/purchase-invoices/${inv.id}/pay$`));
  });

  test('creating an invoice through the form persists it', async ({ api, uid, page }) => {
    test.fail(
      true,
      'UI+API BUG: "Create" on /purchase-invoices/new never sends a request: _doSaveInternal() has the svc.create() call commented out, ' +
        'and POST /purchase-invoice is commented out in purchase-invoice.controller.ts. The button spins forever.',
    );
    const bill = uid('PB');
    const product = await pickProduct(api);
    const suppliers = await api.get('/supplier', { page: 1, limit: 50 });
    const supplier = suppliers.suppliers.find((s: any) => s.gstin && s.stateCode === 'TN');

    await pip.gotoNew();
    await pip.pickSupplier(supplier.name);
    await pip.billNo.fill(bill);
    await pip.pickProduct(product.name);
    await pip.qty.fill('5');
    await pip.rate.fill('120');

    const post = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/purchase-invoice'), { timeout: 3000 });
    await pip.create.click();
    await post;
    await expect(page).not.toHaveURL(/\/new$/);
  });

  test('submitting the empty form shows validation messages and stays on the form', async ({ page }) => {
    await pip.gotoNew();
    await pip.create.click();
    await expect(page.getByText('Supplier is required')).toBeVisible();
    await expect(page.getByText('Required').first()).toBeVisible();
    await expect(page).toHaveURL(/\/purchase-invoices\/new$/);
  });
});
