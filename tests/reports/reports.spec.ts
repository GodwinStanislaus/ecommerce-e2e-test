import { statSync } from 'node:fs';

import { ReportPage } from '../../pages/report.page';
import { isoDate, parseMoney } from '../../support/data';
import { createSalesInvoice } from '../_arrange';
import { expect, test } from '../../fixtures';

test.describe('Reports home', () => {
  test('groups reports by area and opens a report from its card', async ({ page }) => {
    await page.goto('/reports');
    for (const section of ['Receivables', 'Payables', 'Financials', 'Books', 'Inventory', 'Sales', 'GST Reports']) {
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
    }
    await page.getByRole('link', { name: /Date Wise Sales/ }).click();
    await expect(page).toHaveURL(/\/reports\/date-wise-sales$/);
    await expect(page.getByText('Date Wise Sales').first()).toBeVisible();
  });

  const cards: Array<[string, RegExp]> = [
    ['Customer Balance', /\/reports\/customer-balance$/],
    ['Cheque Report', /\/reports\/cheque-report$/],
    ['Sales by Product', /\/reports\/sales-by-product$/],
    ['Sales History by Customer', /\/reports\/sales-history-by-customer$/],
    ['Dues by Customer', /\/reports\/dues-by-customer$/],
  ];
  for (const [name, url] of cards) {
    test(`"${name}" card navigates to its report`, async ({ page }) => {
      await page.goto('/reports');
      await page.getByRole('link', { name: new RegExp(`^\\S*\\s*${name}`) }).first().click();
      await expect(page).toHaveURL(url);
    });
  }
});

test.describe('Date Wise Sales report', () => {
  let rp: ReportPage;

  test.beforeEach(async ({ page }) => {
    rp = new ReportPage(page);
    await rp.open('date-wise-sales');
  });

  test('toolbar: back, date range, customer, Generate; Excel and Print are hidden until data is loaded', async () => {
    await expect(rp.back).toBeVisible();
    await expect(rp.label('From Date')).toBeVisible();
    await expect(rp.label('To Date')).toBeVisible();
    await expect(rp.label('Customer')).toBeVisible();
    await expect(rp.fromDate).toHaveValue(/^\d{4}-\d{2}-01$/);
    await expect(rp.toDate).toHaveValue(isoDate(0));
    await expect(rp.generate).toBeEnabled();
    await expect(rp.excel).toBeHidden();
    await expect(rp.print).toBeHidden();
  });

  test('Generate lists a fresh invoice with customer and amount; Excel and Print appear', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await rp.afterResponse('GET', '/reports/date-wise-sales', () => rp.generate.click());

    const row = rp.dataRows().filter({ has: rp.page.getByRole('cell', { name: inv.invoiceNumber, exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(inv.customer.name);
    expect(parseMoney(await row.getByRole('cell').nth(8).innerText())).toBe(inv.grandTotal);
    await expect(rp.excel).toBeVisible();
    await expect(rp.print).toBeVisible();
  });

  test('quick filter narrows rows, shows a match counter and says when nothing matches', async ({ api, uid }) => {
    const inv = await createSalesInvoice(api);
    await rp.afterResponse('GET', '/reports/date-wise-sales', () => rp.generate.click());
    await expect(rp.dataRows().first()).toBeVisible();

    await rp.quickFilter.fill(inv.customer.name);
    await expect(rp.quickFilterCount).toHaveText(/^\s*\d+\/\d+\s*$/);
    await rp.quickFilter.fill(uid('zzNOMATCH'));
    await expect(rp.quickFilterCount).toHaveText(/No match/);
    await expect(rp.dataRows()).toHaveCount(0);

    await rp.page.getByTitle('Clear filter').click();
    await expect(rp.quickFilter).toHaveValue('');
    await expect(rp.dataRows().first()).toBeVisible();
  });

  test('quick filter by invoice number isolates that invoice', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await rp.afterResponse('GET', '/reports/date-wise-sales', () => rp.generate.click());
    await rp.quickFilter.fill(inv.invoiceNumber);
    await expect(rp.dataRows().filter({ has: rp.page.getByRole('cell', { name: inv.invoiceNumber, exact: true }) })).toHaveCount(1);
  });

  test('a date range in the past excludes today\'s invoice', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await rp.setDate(rp.fromDate, '2020-01-01');
    await rp.setDate(rp.toDate, '2020-01-31');
    await rp.afterResponse('GET', '/reports/date-wise-sales', () => rp.generate.click());
    await expect(rp.page.getByRole('cell', { name: inv.invoiceNumber, exact: true })).toHaveCount(0);
  });

  test('Excel downloads a non-empty .xlsx named after the report and range', async ({ api }) => {
    await createSalesInvoice(api);
    await rp.afterResponse('GET', '/reports/date-wise-sales', () => rp.generate.click());
    const download = await rp.downloadExcel();
    expect(download.suggestedFilename()).toMatch(/^DateWiseSales_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(statSync(await download.path()).size).toBeGreaterThan(1000);
  });

  test('Print calls the browser print dialog', async ({ api }) => {
    await createSalesInvoice(api);
    await rp.afterResponse('GET', '/reports/date-wise-sales', () => rp.generate.click());
    await rp.stubPrint();
    await rp.print.click();
    await expect.poll(() => rp.printCalls()).toBe(1);
  });

  test('Back returns to the reports home', async ({ page }) => {
    await rp.back.click();
    await expect(page).toHaveURL(/\/reports$/);
  });
});

test.describe('Customer Balance report', () => {
  let rp: ReportPage;

  test.beforeEach(async ({ page }) => {
    rp = new ReportPage(page);
    await rp.open('customer-balance');
  });

  test('loads on open for today and lists the customer that was just invoiced', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    await rp.afterResponse('GET', '/reports/customer-balance', () => rp.generate.click());
    await expect(rp.page.getByText(/\d+ customer\(s\)/)).toBeVisible();
    await expect(rp.dataRows().filter({ hasText: inv.customer.name }).first()).toBeVisible();
    await expect(rp.excel).toBeVisible();
    await expect(rp.print).toBeVisible();
  });

  test('Excel downloads a non-empty .xlsx', async () => {
    await rp.afterResponse('GET', '/reports/customer-balance', () => rp.generate.click());
    const download = await rp.downloadExcel();
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    expect(statSync(await download.path()).size).toBeGreaterThan(1000);
  });

  test('has a client-side quick filter above the table', async () => {
    test.fail(
      true,
      'UI BUG: customer-balance.component.ts has no <app-table-quick-filter>, which copilot-instructions.md makes mandatory for every report table.',
    );
    await rp.afterResponse('GET', '/reports/customer-balance', () => rp.generate.click());
    await expect(rp.quickFilter).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Sales by Product report', () => {
  let rp: ReportPage;

  test.beforeEach(async ({ page }) => {
    rp = new ReportPage(page);
    await rp.open('sales-by-product');
  });

  test('Generate stays disabled until a product is chosen', async () => {
    await expect(rp.page.getByRole('combobox', { name: 'Product' })).toBeVisible();
    await expect(rp.generate).toBeDisabled();
    await expect(rp.excel).toBeHidden();
  });

  test('lists the invoice that sold the chosen product, with Excel and Print available', async ({ api }) => {
    const inv = await createSalesInvoice(api);
    const product = rp.page.getByRole('combobox', { name: 'Product' });
    await product.fill(inv.product.name);
    await rp.page.getByRole('option', { name: new RegExp(inv.product.name) }).first().click();
    await expect(rp.generate).toBeEnabled();
    await rp.afterResponse('GET', '/reports/sales-by-product', () => rp.generate.click());

    await expect(rp.dataRows().filter({ has: rp.page.getByRole('cell', { name: inv.invoiceNumber, exact: true }) })).toHaveCount(1);
    await expect(rp.excel).toBeVisible();
    await expect(rp.print).toBeVisible();
  });
});

test.describe('Dues by Customer report', () => {
  test('asks for a customer first, then lists that customer\'s outstanding invoice', async ({ page, api }) => {
    const rp = new ReportPage(page);
    const inv = await createSalesInvoice(api);
    await rp.open('dues-by-customer');
    await expect(page.getByText(/Search a customer and click Generate/)).toBeVisible();
    await expect(rp.generate).toBeDisabled();

    await page.locator('app-customer-search').getByRole('textbox').fill(inv.customer.name);
    await page.getByRole('option', { name: new RegExp(inv.customer.name.replace(/[()]/g, '\\$&')) }).or(
      page.getByRole('button', { name: new RegExp(inv.customer.name.replace(/[()]/g, '\\$&')) }),
    ).first().click();
    await expect(rp.generate).toBeEnabled();
    await rp.afterResponse('GET', '/reports/dues-by-customer', () => rp.generate.click());

    const row = rp.dataRows().filter({ has: page.getByRole('cell', { name: inv.invoiceNumber, exact: true }) });
    await expect(row).toHaveCount(1);
    expect(parseMoney(await row.getByRole('cell').nth(3).innerText())).toBe(inv.grandTotal);
    await expect(rp.excel).toBeVisible();
    await expect(rp.print).toBeVisible();
  });
});

test.describe('Sales History by Customer report', () => {
  test('shows the customer, optional product and date range filters', async ({ page }) => {
    const rp = new ReportPage(page);
    await rp.open('sales-history-by-customer');
    await expect(page.locator('app-customer-search').getByRole('textbox')).toBeVisible();
    await expect(page.getByPlaceholder('All products…')).toBeVisible();
    await expect(rp.label('From Date')).toBeVisible();
    await expect(rp.label('To Date')).toBeVisible();
    await expect(rp.generate).toBeDisabled();
    await expect(rp.excel).toBeHidden();
  });
});

test.describe('Credit Note report', () => {
  test('lists a credit note raised today with its customer, product and amount', async ({ page, api, uid }) => {
    const rp = new ReportPage(page);
    const inv = await createSalesInvoice(api, 3);
    const detail = await api.get(`/sales-invoice/${inv.id}/for-note`);
    const item = detail.items[0];
    const note = await api.post('/credit-debit-notes/credit', {
      noteType: 'CREDIT_NOTE',
      salesInvoiceId: inv.id,
      customerId: detail.customerId,
      noteDate: isoDate(0),
      reason: 'Customer Return',
      description: uid('cn-report'),
      returnType: 'GOODS_RETURN',
      items: [{ salesInvoiceItemId: item.id, productId: item.productId, originalQuantity: item.originalBilledQty, adjustedQuantity: 1, unitPrice: item.unitPrice, discountPercent: 0, gstRate: item.gstRate, lineType: 'GOODS_RETURN' }],
      notes: '',
      includeFreightInCredit: false,
    });

    await api.patch(`/credit-debit-notes/${note.id}/approve`, {}); // the report lists approved notes only
    await rp.open('credit-note-report');
    await rp.afterResponse('GET', '/reports/credit-note-report', () => rp.generate.click());
    await rp.quickFilter.fill(note.noteNumber);
    const row = rp.dataRows().filter({ hasText: note.noteNumber });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(inv.customer.name);
    await expect(row).toContainText(inv.product.name);
    await expect(rp.excel).toBeVisible();
    await expect(rp.print).toBeVisible();
  });
});

test.describe('Cheque reports', () => {
  test('Cheque Report generates for the default range with totals, Excel and Print', async ({ page }) => {
    const rp = new ReportPage(page);
    await rp.open('cheque-report');
    await expect(page.getByText(/Select a date range and click/)).toBeVisible();
    await rp.afterResponse('GET', '/reports/cheque-report', () => rp.generate.click());
    await expect(page.getByText(/\d+ cheques?/)).toBeVisible();
    await expect(page.getByText(/GRAND TOTAL/i)).toBeVisible();
    await expect(rp.excel).toBeVisible();
    await expect(rp.print).toBeVisible();
  });

  test('Cheque Report has a quick filter', async ({ page }) => {
    test.fail(true, 'UI BUG: cheque-report has no <app-table-quick-filter> (mandatory per copilot-instructions.md).');
    const rp = new ReportPage(page);
    await rp.open('cheque-report');
    await rp.afterResponse('GET', '/reports/cheque-report', () => rp.generate.click());
    await expect(rp.quickFilter).toBeVisible({ timeout: 3000 });
  });

  test('Return Cheque Report says so when there are no returned cheques in the range', async ({ page }) => {
    const rp = new ReportPage(page);
    await rp.open('return-cheque-report');
    await rp.setDate(rp.fromDate, '2020-01-01');
    await rp.setDate(rp.toDate, '2020-01-31');
    await rp.afterResponse('GET', '/reports/return-cheque-report', () => rp.generate.click());
    await expect(page.getByText('No return cheques found for the selected date range.')).toBeVisible();
  });
});
