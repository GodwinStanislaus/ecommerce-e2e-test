import { expect, test } from '../../fixtures';
import { ReceiptPage } from '../../pages/receipt.page';

import { createCustomer, createReceipt, createSalesInvoice, uniqueMobile } from './arrange';

test.setTimeout(90_000);

test.describe('Receipts list', () => {
  test('loads with search and the create actions', async ({ page }) => {
    const rp = new ReceiptPage(page);
    const list = rp.afterResponse('GET', '/receipt/list', () => rp.goto('/receipt'));
    expect((await list).status()).toBe(200);

    await expect(rp.search).toBeVisible();
    await expect(rp.newReceiptButton).toBeVisible();
    await expect(page.getByTitle('Create group receipt')).toBeVisible();
    await expect(page.getByTitle('Create new trip receipt')).toBeVisible();
  });

  test('shows a recorded receipt with customer, method, reference, amount and status', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const reference = uid('UTR');
    const receipt = await createReceipt(api, {
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: 700,
      method: 'UPI',
      reference,
    });

    const rp = new ReceiptPage(page);
    await rp.gotoList();
    await rp.searchFor(customer.name);

    const row = rp.rowContaining(receipt.receiptNumber);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(customer.name);
    await expect(row).toContainText('UPI');
    await expect(row).toContainText(reference);
    await expect(row).toContainText('₹700.00');
    await expect(row).toContainText('ACTIVE');
  });

  test('search by receipt number narrows the list; no match shows the empty state', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const receipt = await createReceipt(api, { customerId: customer.id, invoiceId: invoice.id, amount: 300 });

    const rp = new ReceiptPage(page);
    await rp.gotoList();
    await rp.searchFor(receipt.receiptNumber);
    await expect(rp.tableRows()).toHaveCount(1);
    await expect(rp.tableRows().first()).toContainText(receipt.receiptNumber);

    await rp.searchFor(`no-such-receipt-${uid('X')}`);
    await expect(rp.emptyState).toBeVisible();
  });

  test('the Receipt button opens the create screen', async ({ page }) => {
    const rp = new ReceiptPage(page);
    await rp.gotoList();
    await rp.newReceiptButton.click();
    await expect(page).toHaveURL(/\/receipt\/new$/);
    await expect(rp.customerInput).toBeVisible();
  });

  test('the view action opens the receipt detail', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const receipt = await createReceipt(api, { customerId: customer.id, invoiceId: invoice.id, amount: 200 });

    const rp = new ReceiptPage(page);
    await rp.gotoList();
    await rp.searchFor(receipt.receiptNumber);
    await rp.rowContaining(receipt.receiptNumber).getByTitle('View receipt').click();

    await expect(page).toHaveURL(new RegExp(`/receipt/${receipt.id}/view`));
    await expect(rp.viewHeading).toHaveText(receipt.receiptNumber);
  });

  test('the row shows the settled invoice number and what is still due', async ({ page, api, uid }) => {
    test.fail(true, 'BUG: GET /receipt/list omits invoiceNumber and amountDue, so the Invoice # and Due columns render empty');
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const receipt = await createReceipt(api, { customerId: customer.id, invoiceId: invoice.id, amount: 500 });

    const rp = new ReceiptPage(page);
    await rp.gotoList();
    await rp.searchFor(receipt.receiptNumber);
    const row = rp.rowContaining(receipt.receiptNumber);
    await expect(row.getByRole('cell', { name: invoice.invoiceNumber, exact: true })).toBeVisible({ timeout: 3_000 });
    await expect(row).toContainText(`₹${(invoice.amountDue - 500).toFixed(2)}`);
  });

  test('searching by invoice number finds the receipt (as the placeholder promises)', async ({ page, api, uid }) => {
    test.fail(true, 'BUG: search box says "receipt number or invoice" but an invoice number matches nothing');
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const receipt = await createReceipt(api, { customerId: customer.id, invoiceId: invoice.id, amount: 100 });

    const rp = new ReceiptPage(page);
    await rp.gotoList();
    await rp.searchFor(invoice.invoiceNumber);
    await expect(rp.rowContaining(receipt.receiptNumber)).toBeVisible({ timeout: 3_000 });
  });
});
