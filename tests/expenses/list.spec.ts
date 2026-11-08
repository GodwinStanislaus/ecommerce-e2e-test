import { test, expect } from '../../fixtures';
import { isoDate } from '../../support/data';
import { ExpensePage } from '../../pages/expense.page';
import { accountByName, createSupplier, headUnder, seedBill } from './helpers';

test.describe('Expenses list', () => {
  let expense: ExpensePage;

  test.beforeEach(({ page }) => {
    expense = new ExpensePage(page);
  });

  test('loads with the default period, filters and table columns', async () => {
    await expense.gotoList();
    await expect(expense.page).toHaveURL(/\/expenses$/);
    await expect(expense.to).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    // Default period starts about three months back
    const from = new Date(await expense.from.inputValue());
    const to = new Date(await expense.to.inputValue());
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(60);
    expect(days).toBeLessThanOrEqual(125);
    await expect(expense.type).toHaveValue('');
    await expect(expense.payment).toHaveValue('');
    for (const col of ['Bill no', 'Bill date', 'Supplier', 'Head', 'Taxable', 'GST', 'Round-off', 'Payable', 'Mode', 'Voucher']) {
      await expect(expense.page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }
  });

  test('New bill opens the bill form', async () => {
    await expense.gotoList();
    await expense.newBill.click();
    await expect(expense.page).toHaveURL(/\/expenses\/new$/);
    await expect(expense.formTitle).toBeVisible();
  });

  test('a bill posted via the API shows with correct amounts, mode and voucher', async ({ api, uid }) => {
    const supplier = uid('SUP');
    const billNo = uid('INV');
    const s = await createSupplier(api, supplier);
    const head = await headUnder(api, 'indirect');
    const bill = await seedBill(api, { entryDate: isoDate(-11), supplierId: s.id, billNo, lines: [{ accountId: head.accountId, rate: 2500, gstRate: 18 }] });

    await expense.gotoList();
    await expense.showDay(isoDate(-11));
    await expense.search(billNo);
    const cells = await expense.rowCells(billNo);
    expect(cells[0]).toBe(billNo);
    expect(cells[2]).toBe(supplier);
    expect(cells[3]).toBe(head.accountName);
    expect(cells[4]).toBe('₹2500');
    expect(cells[5]).toBe('₹450');
    expect(cells[6]).toBe('');
    expect(cells[7]).toBe('₹2950');
    expect(cells[8]).toBe('Credit');
    expect(cells[9]).toBe(bill.voucherNo);
  });

  test('a paid bill is marked Paid and carries a round-off in its payable', async ({ api, uid }) => {
    const supplier = uid('SUP');
    const billNo = uid('INV');
    const s = await createSupplier(api, supplier);
    const head = await headUnder(api, 'indirect');
    const cash = await accountByName(api, 'Cash in Hand');
    // 999.50 + 18% = 1179.41; printed 1179 => round-off -0.41
    await seedBill(api, { entryDate: isoDate(-12),
      supplierId: s.id, billNo, paymentMode: 'CASH', paymentAccountId: cash.accountId,
      billTotal: 1179, lines: [{ accountId: head.accountId, rate: 999.5, gstRate: 18 }],
    });

    await expense.gotoList();
    await expense.showDay(isoDate(-12));
    await expense.search(billNo);
    const cells = await expense.rowCells(billNo);
    expect(cells[4]).toBe('₹999.50');
    expect(cells[5]).toBe('₹179.91');
    expect(cells[6]).toBe('₹-0.41');
    expect(cells[7]).toBe('₹1179');
    expect(cells[8]).toBe('Paid');
  });

  test('quick filter narrows rows by bill no or supplier and says when nothing matches', async ({ api, uid }) => {
    const tag = uid('QF');
    const head = await headUnder(api, 'indirect');
    const a = await createSupplier(api, `${tag} Alpha`);
    const b = await createSupplier(api, `${tag} Beta`);
    const billA = `${tag}-A`;
    const billB = `${tag}-B`;
    await seedBill(api, { entryDate: isoDate(-13), supplierId: a.id, billNo: billA, lines: [{ accountId: head.accountId, rate: 100 }] });
    await seedBill(api, { entryDate: isoDate(-13), supplierId: b.id, billNo: billB, lines: [{ accountId: head.accountId, rate: 200 }] });

    await expense.gotoList();
    await expense.showDay(isoDate(-13));
    await expense.search(tag);
    await expect(expense.tableRows()).toHaveCount(2);
    await expect(expense.page.getByText('2/')).toBeVisible();

    await expense.search(`${tag} Beta`);
    await expect(expense.tableRows()).toHaveCount(1);
    await expect(expense.rowContaining(billB)).toBeVisible();

    await expense.search(billA);
    await expect(expense.tableRows()).toHaveCount(1);
    await expect(expense.rowContaining(`${tag} Alpha`)).toBeVisible();

    await expense.search(`${tag}-nothing-matches-this`);
    await expect(expense.tableRows()).toHaveCount(0);
    await expect(expense.page.getByText('No match')).toBeVisible();

    await expense.page.getByTitle('Clear filter').click();
    await expect(expense.quickFilter).toHaveValue('');
    await expect(expense.tableRows().first()).toBeVisible();
  });

  test('Payment filter separates paid bills from credit bills', async ({ api, uid }) => {
    const tag = uid('PF');
    const head = await headUnder(api, 'indirect');
    const cash = await accountByName(api, 'Cash in Hand');
    const s = await createSupplier(api, `${tag} Sup`);
    await seedBill(api, { entryDate: isoDate(-14), supplierId: s.id, billNo: `${tag}-CR`, lines: [{ accountId: head.accountId, rate: 100 }] });
    await seedBill(api, { entryDate: isoDate(-14),
      supplierId: s.id, billNo: `${tag}-PD`, paymentMode: 'CASH', paymentAccountId: cash.accountId,
      lines: [{ accountId: head.accountId, rate: 100 }],
    });

    await expense.gotoList();
    await expense.showDay(isoDate(-14));
    await expense.search(tag);
    await expect(expense.tableRows()).toHaveCount(2);

    await expense.payment.selectOption('CASH');
    await expect(expense.tableRows()).toHaveCount(1);
    await expect(expense.rowContaining(`${tag}-PD`)).toContainText('Paid');

    await expense.payment.selectOption('CREDIT');
    await expect(expense.tableRows()).toHaveCount(1);
    await expect(expense.rowContaining(`${tag}-CR`)).toContainText('Credit');

    await expense.payment.selectOption('');
    await expect(expense.tableRows()).toHaveCount(2);
  });

  test('Type filter shows direct or indirect expense heads only', async ({ api, uid }) => {
    const tag = uid('TF');
    const direct = await headUnder(api, 'direct');
    const indirect = await headUnder(api, 'indirect');
    const s = await createSupplier(api, `${tag} Sup`);
    await seedBill(api, { entryDate: isoDate(-15), supplierId: s.id, billNo: `${tag}-D`, lines: [{ accountId: direct.accountId, rate: 100 }] });
    await seedBill(api, { entryDate: isoDate(-15), supplierId: s.id, billNo: `${tag}-I`, lines: [{ accountId: indirect.accountId, rate: 100 }] });

    await expense.gotoList();
    await expense.showDay(isoDate(-15));
    await expense.search(tag);
    await expect(expense.tableRows()).toHaveCount(2);

    await expense.afterResponse('GET', /\/expense-entries\?.*type=direct/, () => expense.type.selectOption('direct'));
    await expect(expense.rowContaining(`${tag}-D`)).toBeVisible();
    await expect(expense.rowContaining(`${tag}-I`)).toHaveCount(0);

    await expense.afterResponse('GET', /\/expense-entries\?.*type=indirect/, () => expense.type.selectOption('indirect'));
    await expect(expense.rowContaining(`${tag}-I`)).toBeVisible();
    await expect(expense.rowContaining(`${tag}-D`)).toHaveCount(0);

    await expense.afterResponse('GET', '/expense-entries', () => expense.type.selectOption(''));
    await expect(expense.tableRows()).toHaveCount(2);
  });

  test('date range filter includes and excludes a bill by entry date', async ({ api, uid }) => {
    const billNo = uid('DF');
    const head = await headUnder(api, 'indirect');
    const s = await createSupplier(api, `${billNo} Sup`);
    await seedBill(api, { entryDate: isoDate(-16), supplierId: s.id, billNo, lines: [{ accountId: head.accountId, rate: 100 }] });

    await expense.gotoList();
    await expense.showDay(isoDate(-16));
    await expense.search(billNo);
    await expect(expense.rowContaining(billNo)).toBeVisible();

    // Range that starts the day after: the bill drops out
    await expense.showDay(isoDate(-15));
    await expect(expense.rowContaining(billNo)).toHaveCount(0);

    // Range ending the day before: also out
    await expense.showDay(isoDate(-17));
    await expect(expense.rowContaining(billNo)).toHaveCount(0);

    // A range spanning the entry date brings it back
    await expense.afterResponse('GET', `from=${isoDate(-17)}`, async () => {
      await expense.to.fill(isoDate(-15));
    });
    await expect(expense.rowContaining(billNo)).toBeVisible();
  });

  test('empty period shows the empty state with a New bill shortcut', async () => {
    await expense.gotoList();
    await expense.afterResponse('GET', '/expense-entries', () => expense.from.fill(isoDate(400)));
    await expect(expense.emptyState).toBeVisible();
    await expense.page.getByRole('button', { name: 'New bill' }).last().click();
    await expect(expense.page).toHaveURL(/\/expenses\/new$/);
  });

  test('clicking a row opens the read-only bill', async ({ api, uid }) => {
    const supplier = uid('SUP');
    const billNo = uid('INV');
    const s = await createSupplier(api, supplier);
    const head = await headUnder(api, 'indirect');
    const bill = await seedBill(api, { entryDate: isoDate(-17), supplierId: s.id, billNo, lines: [{ accountId: head.accountId, rate: 1000, gstRate: 12 }] });

    await expense.gotoList();
    await expense.showDay(isoDate(-17));
    await expense.search(billNo);
    await expense.rowContaining(billNo).click();
    await expect(expense.page).toHaveURL(new RegExp(`/expenses/${bill.id}$`));
    await expect(expense.viewTitle).toContainText(billNo);
    await expect(expense.viewField('Supplier')).toHaveText(supplier);
    await expect(expense.viewField('Voucher')).toHaveText(bill.voucherNo);
    await expect(expense.payable).toHaveText(/₹1,120\.00/);
    // Bills are read-only: no edit or delete controls
    await expect(expense.page.getByRole('button', { name: /edit|delete|cancel bill/i })).toHaveCount(0);
    await expense.page.getByRole('button', { name: 'Back to expenses' }).click();
    await expect(expense.page).toHaveURL(/\/expenses$/);
  });

  test('summary panel shows direct and indirect totals that match the API', async ({ api, uid }) => {
    const tag = uid('SM');
    const direct = await headUnder(api, 'direct');
    const s = await createSupplier(api, `${tag} Sup`);
    await seedBill(api, { supplierId: s.id, billNo: tag, lines: [{ accountId: direct.accountId, rate: 777, gstRate: 0 }] });

    await expense.gotoList();
    await expense.openSummary();
    const summary = await api.get<{ directTotal: number; indirectTotal: number; direct: { accountName: string; entryCount: number }[] }>(
      '/expense-entries/summary',
      { from: await expense.from.inputValue(), to: await expense.to.inputValue() },
    );
    const card = expense.summaryCard('Direct Expenses');
    await expect(card.locator('.badge')).toHaveText(`₹${summary.directTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    await expect(card.getByRole('row').filter({ hasText: direct.accountName })).toBeVisible();
    expect(summary.direct.find((d) => d.accountName === direct.accountName)?.entryCount).toBeGreaterThanOrEqual(1);
    await expect(expense.summaryCard('Indirect Expenses')).toBeVisible();
  });
});
