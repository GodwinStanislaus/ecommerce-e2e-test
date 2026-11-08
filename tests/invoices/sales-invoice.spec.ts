import { SalesInvoicePage } from '../../pages/sales-invoice.page';
import { isoDate, parseMoney } from '../../support/data';
import { createSalesInvoice } from '../_arrange';
import { expect, test } from '../../fixtures';

test.describe('Sales invoices', () => {
  let sip: SalesInvoicePage;

  test.beforeEach(({ page }) => {
    sip = new SalesInvoicePage(page);
  });

  test('list shows the toolbar filters and table columns', async ({ page }) => {
    await sip.gotoList();
    await expect(sip.heading).toBeVisible();
    await expect(sip.statusFilter).toBeVisible();
    await expect(sip.paymentFilter).toBeVisible();
    await expect(sip.deliveryFilter).toBeVisible();
    await expect(sip.receiptButton).toBeVisible();
    for (const col of ['Invoice', 'Customer', 'Invoice Date', 'Total', 'Delivery', 'Amount Due', 'Payment', 'Status', 'Actions']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }
    await expect(sip.statusFilter.getByRole('option')).toHaveText([
      'All Statuses', 'Draft', 'Finalized', 'IRP Registered', 'IRP Failed', 'Cancelled',
      'Partially Reversed', 'Fully Reversed', 'Adjusted',
    ]);
  });

  test('a new invoice is listed with its customer, total and unpaid state', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await sip.gotoList();
    await sip.searchFor(inv.invoiceNumber);

    const row = sip.row(inv.invoiceNumber);
    await expect(row).toBeVisible();
    await expect(row).toContainText(inv.customer.name);
    await expect(row.getByRole('cell').nth(4)).toHaveText(/₹/);
    expect(parseMoney(await row.getByRole('cell').nth(4).innerText())).toBe(inv.grandTotal);
    await expect(row).toContainText('Unpaid');
    await expect(row).toContainText('Pending');
  });

  test('searching for a number that does not exist shows the empty state', async ({ uid }) => {
    await sip.gotoList();
    await sip.searchFor(uid('NOPE'));
    await expect(sip.emptyState).toBeVisible();
  });

  test('payment filter separates unpaid invoices from paid ones', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await sip.gotoList();
    await sip.searchFor(inv.invoiceNumber);
    await expect(sip.row(inv.invoiceNumber)).toBeVisible();

    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.paymentFilter.selectOption({ label: 'Paid' }));
    await expect(sip.row(inv.invoiceNumber)).toHaveCount(0);

    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.paymentFilter.selectOption({ label: 'Unpaid' }));
    await expect(sip.row(inv.invoiceNumber)).toBeVisible();
  });

  test('date range filter includes today and excludes a future window', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await sip.gotoList();
    await sip.searchFor(inv.invoiceNumber);
    await expect(sip.row(inv.invoiceNumber)).toBeVisible();

    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.dateFrom.fill(isoDate(2)));
    await expect(sip.row(inv.invoiceNumber)).toHaveCount(0);

    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.dateFrom.fill(isoDate(0)));
    await expect(sip.row(inv.invoiceNumber)).toBeVisible();
  });

  test('Clear resets the payment and date filters', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await sip.gotoList();
    await sip.searchFor(inv.invoiceNumber);
    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.paymentFilter.selectOption({ label: 'Paid' }));
    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.dateFrom.fill(isoDate(0)));
    await expect(sip.clearFilters).toBeVisible();

    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.clearFilters.click());
    await expect(sip.paymentFilter).toHaveValue('');
    await expect(sip.dateFrom).toHaveValue('');
  });

  test('Clear also empties the search box', async ({ api }) => {
    test.fail(true, 'UI BUG: clearFilters() in sales-invoice-list.component.ts never resets searchControl, although it counts as an active filter');
    const inv = await createSalesInvoice(api);
    await sip.gotoList();
    await sip.searchFor(inv.invoiceNumber);
    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.paymentFilter.selectOption({ label: 'Paid' }));
    await sip.afterResponse('GET', '/sales-invoice/list', () => sip.clearFilters.click());
    await expect(sip.search).toHaveValue('', { timeout: 3000 });
  });

  test('opens the invoice view from the row and shows lines and totals', async ({ api, page }) => {
    const inv = await createSalesInvoice(api, 3);
    await sip.gotoList();
    await sip.searchFor(inv.invoiceNumber);
    await sip.viewButton(sip.row(inv.invoiceNumber)).click();

    await expect(page).toHaveURL(new RegExp(`/invoices/${inv.id}$`));
    await expect(sip.viewHeader(inv.invoiceNumber)).toBeVisible();
    await expect(page.getByText(inv.customer.name).first()).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(inv.product.name) }).first()).toBeVisible();

    const grand = await sip.totalsRow('Grand Total').innerText();
    expect(parseMoney(grand)).toBe(inv.grandTotal);
    const due = await sip.totalsRow('Amount Due').innerText();
    expect(parseMoney(due)).toBe(inv.grandTotal);
  });

  test('Print on the view screen calls the browser print dialog', async ({ api, page }) => {
    const inv = await createSalesInvoice(api);
    await sip.gotoView(inv.id);
    await expect(sip.viewHeader(inv.invoiceNumber)).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __prints: number }).__prints = 0;
      window.print = () => {
        (window as unknown as { __prints: number }).__prints += 1;
      };
    });
    await sip.printButton.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBeGreaterThan(0);
  });

  test('cancelling an unpaid invoice asks for confirmation and persists the cancellation', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await sip.gotoView(inv.id);
    await expect(sip.viewHeader(inv.invoiceNumber)).toBeVisible();

    await sip.cancelButton.click();
    await expect(sip.confirmDialog).toContainText(`cancel invoice ${inv.invoiceNumber}`);
    await sip.afterResponse('PATCH', `/sales-invoice/${inv.id}/cancel`, () =>
      sip.confirmDialog.getByRole('button', { name: 'Cancel Invoice' }).click(),
    );

    await expect(sip.toast('Invoice cancelled successfully').first()).toBeVisible();
    await expect(sip.cancelButton).toHaveCount(0);
    const saved = await api.get(`/sales-invoice/${inv.id}`);
    expect(saved.invoiceStatus).toBe('CANCELLED');
  });

  test('keeping the invoice when the cancel dialog is dismissed', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await sip.gotoView(inv.id);
    await sip.cancelButton.click();
    await expect(sip.confirmDialog).toBeVisible();
    await sip.confirmDialog.getByRole('button').filter({ hasNotText: 'Cancel Invoice' }).last().click();
    await expect(sip.confirmDialog).toHaveCount(0);
    const saved = await api.get(`/sales-invoice/${inv.id}`);
    expect(saved.invoiceStatus).not.toBe('CANCELLED');
  });
});
