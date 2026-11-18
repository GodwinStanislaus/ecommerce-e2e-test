import { test, expect } from '../../fixtures';
import { isoDate } from '../../support/data';
import { ExpensePage } from '../../pages/expense.page';
import { createSupplier, headUnder, seedBill } from './helpers';

test.describe('Supplier bill form: validation and behaviour', () => {
  let expense: ExpensePage;
  let supplier: string;
  let head: string;

  test.beforeEach(async ({ page, api, sharedSupplier }) => {
    expense = new ExpensePage(page);
    supplier = sharedSupplier.name;
    head = (await headUnder(api, 'indirect')).accountName;
    await expense.gotoNew();
  });

  /** Clicks Save and asserts the form stayed put (no bill created). */
  async function saveRefused(): Promise<void> {
    await expense.save.click();
    await expect(expense.problems).toBeVisible();
    await expect(expense.page).toHaveURL(/\/expenses\/new$/);
  }

  test('errors stay hidden until Save is clicked', async () => {
    await expect(expense.problems).toHaveCount(0);
    await expect(expense.page.locator('.eb-error')).toHaveCount(0);
    await expect(expense.save).toBeEnabled();
  });

  test('empty form lists every missing required field', async () => {
    await saveRefused();
    await expect(expense.problems).toContainText('Pick the supplier who issued the bill');
    await expect(expense.problems).toContainText('Enter the invoice number: GST credit needs it');
    await expect(expense.problems).toContainText('Enter the invoice date: GST credit needs it');
    await expect(expense.problems).toContainText('Line 1: Choose the expense head');
    await expect(expense.problems).toContainText('Line 1: Enter the price before GST');
    await expect(expense.problems).toContainText('Line 1: Enter the SAC (4 to 8 digits)');
    // Inline messages sit next to the fields too
    await expect(expense.page.locator('.eb-error').filter({ hasText: 'Pick the supplier who issued the bill' })).toBeVisible();
    await expect(expense.supplier).toHaveClass(/is-invalid/);
    await expect(expense.invoiceNo).toHaveClass(/is-invalid/);
    await expect(expense.line(1).rate).toHaveClass(/is-invalid/);
  });

  test('an inline error clears once the field is fixed', async () => {
    await saveRefused();
    await expense.invoiceNo.fill('X-1');
    await expect(expense.invoiceNo).not.toHaveClass(/is-invalid/);
    await expect(expense.problems).not.toContainText('Enter the invoice number');
  });

  test('cash or bank payment needs a paid-from account', async ({ uid }) => {
    await expense.fillBill({
      supplier, pay: 'Bank', invoiceNo: uid('INV'), invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 100, gst: 18 }],
    });
    // The form picks the account itself when the mode has only one, leaving nothing to validate.
    test.skip(
      (await expense.paidFrom.inputValue()) !== '',
      'This environment has a single bank account, so Paid from is pre-selected.',
    );
    await saveRefused();
    await expect(expense.problems).toContainText('Choose the account the bill was paid from');
    await expect(expense.paidFrom).toHaveClass(/is-invalid/);
    await expense.paidFrom.selectOption({ index: 1 });
    await expect(expense.problems).toBeHidden();
  });

  test('SAC must be 4 to 8 digits', async ({ uid }) => {
    await expense.fillBill({
      supplier, invoiceNo: uid('INV'), invoiceDate: isoDate(0),
      lines: [{ head, sac: '12', rate: 100, gst: 18 }],
    });
    await saveRefused();
    await expect(expense.problems).toContainText('Line 1: SAC must be 4 to 8 digits');
    await expense.line(1).sac.fill('998599');
    await expect(expense.problems).toBeHidden();
  });

  test('rate must be above zero and quantity cannot be zero', async ({ uid }) => {
    await expense.fillBill({
      supplier, invoiceNo: uid('INV'), invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 0, qty: 0, gst: 18 }],
    });
    await saveRefused();
    await expect(expense.problems).toContainText('Line 1: Enter the price before GST');
    await expect(expense.problems).toContainText('Line 1: Quantity must be more than 0');
  });

  test('invoice date cannot be after the entry date', async ({ uid }) => {
    await expense.fillBill({
      supplier, invoiceNo: uid('INV'), invoiceDate: isoDate(0), entryDate: isoDate(-3),
      lines: [{ head, sac: '9985', rate: 100, gst: 18 }],
    });
    await saveRefused();
    await expect(expense.problems).toContainText('The invoice date cannot be after the entry date');
  });

  test('service period end cannot precede its start', async ({ uid }) => {
    await expense.fillBill({
      supplier, invoiceNo: uid('INV'), invoiceDate: isoDate(0),
      serviceFrom: isoDate(10), serviceTo: isoDate(5),
      lines: [{ head, sac: '9985', rate: 100, gst: 18 }],
    });
    await saveRefused();
    await expect(expense.problems).toContainText('Period end is before its start');
  });

  test('bill link must be an http(s) address', async ({ uid }) => {
    await expense.fillBill({
      supplier, invoiceNo: uid('INV'), invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 100, gst: 18 }],
      attachment: 'javascript:alert(1)',
    });
    await saveRefused();
    await expect(expense.problems).toContainText('Enter a web address starting with http:// or https://');
  });

  test('printed total of zero is refused', async ({ uid }) => {
    await expense.fillBill({
      supplier, invoiceNo: uid('INV'), invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 100, gst: 18 }],
      printedTotal: 0,
    });
    await saveRefused();
    await expect(expense.problems).toContainText('Printed total must be more than 0');
  });

  test('a recorded supplier invoice is flagged while typing and refused on save', async ({ api, uid }) => {
    const dup = uid('INV');
    const s = await api.get<{ suppliers?: { id: string; name: string }[]; data?: { id: string; name: string }[] }>('/supplier', { search: supplier, pageSize: 5 });
    const id = (s.suppliers ?? s.data ?? [])[0]?.id;
    expect(id, 'supplier created in beforeEach is searchable').toBeTruthy();
    const h = await headUnder(api, 'indirect');
    await seedBill(api, { supplierId: id!, billNo: dup, lines: [{ accountId: h.accountId, rate: 100 }] });

    await expense.pickSupplier(supplier);
    await expense.invoiceNo.fill(dup);
    await expect(expense.page.getByText(/looks already recorded/)).toBeVisible();

    await expense.fillBill({ invoiceDate: isoDate(0), lines: [{ head, sac: '9985', rate: 100, gst: 18 }] });
    const res = await expense.submit();
    expect(res.status()).toBe(409);
    await expect(expense.page).toHaveURL(/\/expenses\/new$/);
    await expect(expense.page.locator('.eb-error').filter({ hasText: 'already recorded' })).toBeVisible();
    // Another invoice number from the same supplier is fine again
    await expense.invoiceNo.fill(uid('INV'));
    await expect(expense.page.getByText(/looks already recorded/)).toHaveCount(0);
  });

  test('supplier without GSTIN: warning shown and all GST is booked as cost', async ({ api, uid }) => {
    const plain = uid('NOGST');
    await createSupplier(api, plain, null);
    await expense.fillBill({
      supplier: plain, invoiceNo: uid('INV'), invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 1000, gst: 18 }],
    });
    await expect(expense.page.getByText('This supplier has no GSTIN')).toBeVisible();
    await expect(expense.page.getByText('No GSTIN', { exact: true })).toBeVisible();
    await expect(expense.page.getByText(/Input credit/)).toContainText('₹180.00');
    const saved = await (await expense.submit()).json();
    await expect(expense.page).toHaveURL(new RegExp(`/expenses/${saved.id}$`));
  });

  // BUG (ecommerce-bolt): expense-form.component.html binds [disabled]="noGstin()" on a formControlName input,
  // which Angular ignores for reactive forms, so the ITC switch stays enabled. Remove test.fail() once fixed.
  test('supplier without GSTIN: ITC switch is locked', async ({ api, uid }) => {
    test.fail();
    const plain = uid('NOGST');
    await createSupplier(api, plain, null);
    await expense.pickSupplier(plain);
    await expect(expense.line(1).itc).toBeDisabled({ timeout: 3000 });
  });

  test('without any GST, invoice number and date are not required', async () => {
    await expense.fillBill({ supplier, lines: [{ head, rate: 100, gst: 0 }] });
    await expect(expense.page.getByText('Needed for the GST return')).toHaveCount(0);
    await expect(expense.page.locator('label', { hasText: 'Invoice no.' }).locator('.eb-req')).toHaveCount(0);
    await expense.save.click();
    await expect(expense.page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
  });

  test('lines can be added, duplicated and removed; the last line is cleared instead', async () => {
    await expense.fillBill({ lines: [{ head, description: 'First', rate: 100, gst: 18, sac: '9985' }] });
    await expense.addLine.click();
    await expect(expense.page.locator('table.eb-lines tbody tr')).toHaveCount(2);
    // New line inherits head, GST % and SAC from the line above
    await expect(expense.line(2).head).toHaveValue(head);
    await expect(expense.line(2).sac).toHaveValue('9985');

    await expense.line(1).duplicate.click();
    await expect(expense.page.locator('table.eb-lines tbody tr')).toHaveCount(3);
    await expect(expense.line(2).description).toHaveValue('First');
    await expect(expense.line(2).rate).toHaveValue('100');

    await expense.line(3).remove.click();
    await expect(expense.page.locator('table.eb-lines tbody tr')).toHaveCount(2);
    await expense.line(2).remove.click();
    await expect(expense.page.locator('table.eb-lines tbody tr')).toHaveCount(1);

    // Removing the only line resets it rather than leaving the bill with none
    await expense.line(1).remove.click();
    await expect(expense.page.locator('table.eb-lines tbody tr')).toHaveCount(1);
    await expect(expense.line(1).description).toHaveValue('');
    await expect(expense.line(1).rate).toHaveValue('');
    await expect(expense.payable).toHaveText(/₹0\.00/);
  });

  test('Cancel returns to the list without saving', async () => {
    await expense.fillBill({ supplier, invoiceNo: 'WILL-NOT-SAVE' });
    await expense.cancel.click();
    await expect(expense.page).toHaveURL(/\/expenses$/);
    await expect(expense.listHeading).toBeVisible();
  });

  test('an unknown bill id shows an error instead of a blank page', async () => {
    await expense.page.goto('/expenses/00000000-0000-0000-0000-000000000000');
    await expect(expense.page.getByText('This bill was not found.')).toBeVisible();
  });
});
