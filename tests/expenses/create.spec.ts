import { test, expect } from '../../fixtures';
import { isoDate, money } from '../../support/data';
import { ExpensePage } from '../../pages/expense.page';
import { ACCOUNTS } from '../books/book-data';
import { GSTIN, headUnder } from './helpers';

const BANK = ACCOUNTS.bank.name;

interface SavedBill {
  id: string;
  voucherNo: string;
  billNo: string;
  paymentMode: string;
  paymentAccountName: string | null;
  amount: number;
  gstAmount: number;
  roundOff: number;
  totalAmount: number;
  description: string | null;
  attachmentUrl: string | null;
  serviceFrom: string | null;
  serviceTo: string | null;
  supplierName: string;
  lines: { accountName: string; rate: number; quantity: number; gstRate: number; gstAmount: number; taxableValue: number; itcEligible: boolean; sacCode: string | null }[];
}

test.describe('Create supplier bill', () => {
  let expense: ExpensePage;
  let supplier: string;
  let head: string;
  let head2: string;

  test.beforeEach(async ({ page, api, sharedSupplier }) => {
    expense = new ExpensePage(page);
    supplier = sharedSupplier.name;
    head = (await headUnder(api, 'indirect')).accountName;
    head2 = (await headUnder(api, 'direct')).accountName;
    await expense.gotoNew();
  });

  test('new-bill form opens with sensible defaults', async () => {
    await expect(expense.page.getByRole('group', { name: 'Payment' }).getByRole('button', { name: /Pay later$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(expense.entryDate).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(expense.line(1).qty).toHaveValue('1');
    await expect(expense.line(1).gst).toHaveValue(/18/);
    await expect(expense.page.getByText('Pay later: recorded as payable to the supplier.')).toBeVisible();
    await expect(expense.payable).toHaveText(/₹0\.00/);
  });

  test('pay-later bill with 18% GST: totals preview matches what is saved', async ({ api, uid }) => {
    const invoice = uid('INV');
    await expense.fillBill({
      supplier,
      invoiceNo: invoice,
      invoiceDate: isoDate(0),
      lines: [{ head, description: 'Warehouse rent', sac: '997212', qty: 2, unit: 'mth', rate: 1500 }],
    });

    // 2 x 1500 = 3000 taxable, 18% = 540, payable 3540
    await expect(expense.totalsRow('Lines total (taxable)')).toHaveText(/₹3,000\.00/);
    await expect(expense.totalsRow('Total GST')).toHaveText(/₹540\.00/);
    await expect(expense.payable).toHaveText(/₹3,540\.00/);
    await expect(expense.page.getByText(`Payable on credit to ${supplier}: ₹3,540.00`)).toBeVisible();
    await expect(expense.line(1).row.locator('.eb-c-taxable')).toHaveText(/₹3,000\.00/);
    await expect(expense.line(1).row.locator('.eb-c-tax')).toHaveText(/₹540\.00/);

    const res = await expense.submit();
    expect(res.status()).toBe(201);
    const saved = await res.json();

    await expect(expense.page).toHaveURL(new RegExp(`/expenses/${saved.id}$`));
    await expect(expense.toast(`Bill ${invoice} saved as ${saved.voucherNo}`).first()).toBeVisible();

    const bill = await api.get<SavedBill>(`/expense-entries/${saved.id}`);
    expect(bill).toMatchObject({ billNo: invoice, paymentMode: 'CREDIT', amount: 3000, gstAmount: 540, totalAmount: 3540, supplierName: supplier });
    expect(bill.paymentAccountName).toBeNull();
    expect(bill.lines).toHaveLength(1);
    expect(bill.lines[0]).toMatchObject({ rate: 1500, quantity: 2, gstRate: 18, gstAmount: 540, taxableValue: 3000, itcEligible: true, sacCode: '997212' });

    // The read-only view shows the same figures
    await expect(expense.viewTitle).toContainText(invoice);
    await expect(expense.page.getByText('On credit', { exact: true })).toBeVisible();
    await expect(expense.viewField('Supplier')).toHaveText(supplier);
    await expect(expense.viewField('Invoice no.')).toHaveText(invoice);
    await expect(expense.totalsRow('Lines total (taxable)')).toHaveText(/₹3,000\.00/);
    await expect(expense.payable).toHaveText(/₹3,540\.00/);
    await expect(expense.page.getByRole('row').filter({ hasText: 'Warehouse rent' })).toContainText('997212');
  });

  test('cash bill is paid from a cash account and shows as Paid', async ({ api, uid }) => {
    const invoice = uid('INV');
    await expense.fillBill({
      supplier,
      pay: 'Cash',
      invoiceNo: invoice,
      invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 800, gst: 18 }],
    });
    // Cash lists cash accounts only
    const options = await expense.paidFrom.locator('option').allInnerTexts();
    expect(options).toContain('Cash in Hand');
    expect(options.join('|')).not.toMatch(/HDFC|ICICI|Axis/);
    await expense.paidFrom.selectOption({ label: 'Cash in Hand' });
    await expect(expense.page.getByText(`Paid to ${supplier}: ₹944.00`)).toBeVisible();

    const saved = await (await expense.submit()).json();
    await expect(expense.page).toHaveURL(new RegExp(`/expenses/${saved.id}$`));
    await expect(expense.page.getByText('Paid', { exact: true })).toBeVisible();
    await expect(expense.viewField('Paid from')).toHaveText('Cash in Hand');

    const bill = await api.get<SavedBill>(`/expense-entries/${saved.id}`);
    expect(bill).toMatchObject({ paymentMode: 'CASH', paymentAccountName: 'Cash in Hand', amount: 800, gstAmount: 144, totalAmount: 944 });
  });

  test('bank bill lists bank accounts only and records the chosen one', async ({ api, uid }) => {
    const invoice = uid('INV');
    await expense.fillBill({
      supplier,
      pay: 'Bank',
      invoiceNo: invoice,
      invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 500, gst: 12 }],
    });
    const options = await expense.paidFrom.locator('option').allInnerTexts();
    expect(options).toContain(BANK);
    expect(options).not.toContain('Cash in Hand');
    await expense.paidFrom.selectOption({ label: BANK });

    const saved = await (await expense.submit()).json();
    await expect(expense.viewField('Paid from')).toHaveText(BANK);
    const bill = await api.get<SavedBill>(`/expense-entries/${saved.id}`);
    expect(bill).toMatchObject({ paymentMode: 'CASH', paymentAccountName: BANK, amount: 500, gstAmount: 60, totalAmount: 560 });
  });

  test('switching Cash to Bank clears a paid-from that no longer fits', async () => {
    await expense.fillBill({ pay: 'Cash' });
    await expense.paidFrom.selectOption({ label: 'Cash in Hand' });
    await expense.payButton('Bank').click();
    await expect(expense.paidFrom.locator('option:checked')).toHaveText(/Select bank account/);
  });

  test('multi-line bill with several GST rates, a no-credit line and per-rate totals', async ({ api, uid }) => {
    const invoice = uid('INV');
    await expense.fillBill({
      supplier,
      invoiceNo: invoice,
      invoiceDate: isoDate(0),
      lines: [
        { head, sac: '997212', rate: 1000, gst: 18 },
        { head: head2, sac: '996511', rate: 2000, gst: 5, itc: false },
        { head, rate: 300, gst: 0 },
      ],
    });
    await expect(expense.page.getByText('3', { exact: true }).first()).toBeVisible();
    // 3300 taxable; 180 + 100 GST
    await expect(expense.totalsRow('Lines total (taxable)')).toHaveText(/₹3,300\.00/);
    await expect(expense.totalsRow(/GST 18%/)).toHaveText(/₹180\.00/);
    await expect(expense.totalsRow(/GST 5%/)).toHaveText(/₹100\.00/);
    await expect(expense.totalsRow('Total GST')).toHaveText(/₹280\.00/);
    await expect(expense.payable).toHaveText(/₹3,580\.00/);
    // 5% line has no input credit, so its GST is booked as cost
    await expect(expense.page.getByText(/booked as cost/)).toContainText('₹100.00');

    const saved = await (await expense.submit()).json();
    await expect(expense.page).toHaveURL(new RegExp(`/expenses/${saved.id}$`));
    await expect(expense.page.getByText(/GST booked as cost \(no credit\)/)).toContainText('₹100.00');

    const bill = await api.get<SavedBill>(`/expense-entries/${saved.id}`);
    expect(bill.lines).toHaveLength(3);
    expect(bill).toMatchObject({ amount: 3300, gstAmount: 280, totalAmount: 3580 });
    expect(bill.lines.map((l) => [l.gstRate, l.gstAmount, l.itcEligible])).toEqual([
      [18, 180, true],
      [5, 100, false],
      // a new line copies head, SAC, GST % and ITC of the line above it
      [0, 0, false],
    ]);
    expect(bill.lines[1]?.accountName).toBe(head2);
  });

  test('0% GST bill needs no invoice number or SAC', async ({ api }) => {
    await expense.fillBill({ supplier, lines: [{ head, rate: 450, gst: 0 }] });
    await expect(expense.payable).toHaveText(/₹450\.00/);
    const saved = await (await expense.submit()).json();
    await expect(expense.page).toHaveURL(new RegExp(`/expenses/${saved.id}$`));
    const bill = await api.get<SavedBill>(`/expense-entries/${saved.id}`);
    expect(bill).toMatchObject({ amount: 450, totalAmount: 450 });
    expect(bill.gstAmount ?? 0).toBe(0);
  });

  test('printed GST and printed total produce a round-off that is saved', async ({ api, uid }) => {
    const invoice = uid('INV');
    // 999.50 x 18% = 179.91; lines + GST = 1179.41; printed 1179 => round-off -0.41
    await expense.fillBill({
      supplier,
      invoiceNo: invoice,
      invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 999.5, gst: 18, printedGst: 179.91 }],
      printedTotal: 1179,
    });
    await expect(expense.page.getByText('Matches the printed total')).toBeVisible();
    await expect(expense.totalsRow('Round-off')).toHaveText(/-?₹?-?0\.41/);
    await expect(expense.payable).toHaveText(/₹1,179\.00/);

    const saved = await (await expense.submit()).json();
    const bill = await api.get<SavedBill>(`/expense-entries/${saved.id}`);
    expect(money(bill.roundOff)).toBe(-0.41);
    expect(money(bill.totalAmount)).toBe(1179);
    expect(money(bill.gstAmount)).toBe(179.91);
    await expect(expense.totalsRow('Round-off')).toBeVisible();
  });

  test('printed total far from lines + GST is flagged and refused', async ({ uid }) => {
    await expense.fillBill({
      supplier,
      invoiceNo: uid('INV'),
      invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 1000, gst: 18 }],
      printedTotal: 1500,
    });
    await expect(expense.page.getByText(/Differs from the printed total by/)).toBeVisible();
    await expense.save.click();
    await expect(expense.page).toHaveURL(/\/expenses\/new$/);
    await expect(expense.printedTotal.locator('xpath=following::div[contains(@class,"eb-error")][1]')).toContainText('more than ₹1');
  });

  test('printed GST more than ₹1 off the computed tax is flagged on the line', async ({ uid }) => {
    await expense.fillBill({
      supplier,
      invoiceNo: uid('INV'),
      invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 1000, gst: 18, printedGst: 150 }],
    });
    await expect(expense.page.getByText(/is more than ₹1 from/).first()).toBeVisible();
    await expense.save.click();
    await expect(expense.page).toHaveURL(/\/expenses\/new$/);
    await expect(expense.problems).toContainText('Printed GST');
  });

  test('service period, remarks and bill link are saved and shown', async ({ api, uid }) => {
    const invoice = uid('INV');
    const remark = uid('Remark');
    await expense.fillBill({
      supplier,
      invoiceNo: invoice,
      invoiceDate: isoDate(0),
      serviceFrom: isoDate(-30),
      serviceTo: isoDate(335),
      lines: [{ head, sac: '997131', rate: 12000, gst: 18, description: 'Annual policy' }],
      remarks: remark,
      attachment: 'https://example.com/bill.pdf',
    });
    const saved = await (await expense.submit()).json();
    await expect(expense.viewField('Remarks')).toHaveText(remark);
    await expect(expense.viewField('Service period')).toBeVisible();
    await expect(expense.page.getByRole('link', { name: 'Open attachment' })).toHaveAttribute('href', 'https://example.com/bill.pdf');

    const bill = await api.get<SavedBill>(`/expense-entries/${saved.id}`);
    expect(bill).toMatchObject({ description: remark, attachmentUrl: 'https://example.com/bill.pdf', serviceFrom: isoDate(-30), serviceTo: isoDate(335) });
  });

  test('Save & add another keeps supplier and payment, clears the bill, and both bills persist', async ({ api, uid }) => {
    const first = uid('INV');
    const second = uid('INV');
    await expense.fillBill({
      supplier,
      invoiceNo: first,
      invoiceDate: isoDate(0),
      lines: [{ head, sac: '9985', rate: 100, gst: 18 }],
    });
    await expense.afterResponse('POST', '/expense-entries', () => expense.saveAndAdd.click());
    await expect(expense.toast(`Bill ${first} saved`).first()).toBeVisible();
    await expect(expense.page).toHaveURL(/\/expenses\/new$/);
    await expect(expense.supplier).toHaveValue(supplier);
    await expect(expense.invoiceNo).toHaveValue('');
    await expect(expense.line(1).rate).toHaveValue('');

    await expense.fillBill({ invoiceNo: second, invoiceDate: isoDate(0), lines: [{ head, sac: '9985', rate: 200, gst: 18 }] });
    await (await expense.submit()).json();

    for (const [no, amount] of [[first, 100], [second, 200]] as const) {
      const list = await api.get<{ data: { billNo: string; amount: number; supplierName: string }[] }>('/expense-entries', { billNo: no });
      expect(list.data).toHaveLength(1);
      expect(list.data[0]).toMatchObject({ amount, supplierName: supplier });
    }
  });

  test('a new expense head can be searched by name; GSTIN of the supplier is shown', async () => {
    await expense.pickSupplier(supplier);
    await expect(expense.page.getByText(GSTIN)).toBeVisible();
    await expense.line(1).head.click();
    await expense.line(1).head.fill('zzzz-no-such-head');
    await expect(expense.page.getByText('No match for "zzzz-no-such-head"')).toBeVisible();
  });
});
