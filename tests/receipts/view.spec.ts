import { expect, test } from '../../fixtures';
import { ReceiptPage } from '../../pages/receipt.page';

import { activeBank, createCustomer, createReceipt, createSalesInvoice, uniqueMobile } from './arrange';

test.setTimeout(90_000);

test.describe('Receipt detail', () => {
  test('shows header, customer, method and the invoice allocation', async ({ page, api, uid }) => {
    const customer = await createCustomer(api, uid('E2E Cust'), uniqueMobile());
    const invoice = await createSalesInvoice(api, customer);
    const bank = await activeBank(api);
    const reference = uid('UTR');
    const receipt = await createReceipt(api, {
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: 900,
      method: 'UPI',
      reference,
      bankId: bank.id,
    });

    const rp = new ReceiptPage(page);
    await rp.gotoView(receipt.id);

    await expect(rp.viewHeading).toHaveText(receipt.receiptNumber);
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await expect(page.locator('.customer-name')).toHaveText(customer.name);
    await expect(page.locator('.method-text')).toHaveText('UPI');
    await expect(page.getByText(`Ref: ${reference}`)).toBeVisible();

    const allocation = rp.allocationRow(invoice.invoiceNumber);
    await expect(allocation).toBeVisible();
    await expect(allocation).toContainText('PARTIAL_PAID');
    await expect(allocation).toContainText('₹900');
    await expect(allocation).toContainText(`₹${invoice.amountDue - 900}`);
  });

  test('an unknown receipt id does not render a receipt', async ({ page }) => {
    await page.goto('/receipt/00000000-0000-4000-8000-000000000000/view');
    await expect(page.locator('.receipt-main')).toHaveCount(0);
  });
});
