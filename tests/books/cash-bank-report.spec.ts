import { CashBookReportPage } from '../../pages/cashbook.page';
import { expect, test } from '../../fixtures';
import { isoDate } from '../../support/data';

import { ACCOUNTS, COUNTER, createEntry, quietDay, waitPosted, type Mode } from './book-data';

/** Creates an approved entry and waits until the report can see it. */
async function postedEntry(...args: Parameters<typeof createEntry>) {
  const entry = await createEntry(...args);
  await waitPosted(args[0], entry);
  return entry;
}

const TODAY = () => isoDate(0);

// Entries reach the report asynchronously (outbox worker), so these tests wait for posting and need more time.
test.describe('Cash & Bank Book report', () => {
  test.describe.configure({ timeout: 180_000 });
  let report: CashBookReportPage;

  test.beforeEach(({ page }) => {
    report = new CashBookReportPage(page);
  });

  test('loads with a prompt, today as the default range and export controls hidden until generated', async () => {
    await report.open();
    await expect(report.emptyPrompt).toBeVisible();
    await expect(report.generate).toBeEnabled();
    await expect(report.fromDate).toHaveValue(TODAY());
    await expect(report.toDate).toHaveValue(TODAY());
    await expect(report.excel).toBeHidden();
    await expect(report.print).toBeHidden();
  });

  test('generate is disabled without a date range', async () => {
    await report.open();
    await report.fromDate.fill('');
    await expect(report.generate).toBeDisabled();
  });

  for (const mode of ['cash', 'bank'] as Mode[]) {
    const acc = ACCOUNTS[mode];

    test.describe(`${mode} account`, () => {
      test(`a ${mode} receipt shows on the receipts side with the counter ledger`, async ({ api, uid }) => {
        const marker = uid('RPR');
        const entry = await postedEntry(api, mode, 'receipt', 777.25, marker);

        await report.open();
        await report.run(TODAY(), TODAY(), acc.name);
        const card = report.accountCard(acc.name);
        await expect(card).toBeVisible();

        await report.quickFilter.fill(entry.voucherNumber);
        const row = report.entryRows(card);
        await expect(row).toHaveCount(1);
        const e = await report.entry(row);
        expect(e.receipts).toBe(777.25);
        expect(e.payments).toBe(0);
        expect(e.party).toContain(COUNTER.receipt.name);
        expect(e.date).toBe(new Date(`${TODAY()}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-'));
      });

      test(`a ${mode} payment shows on the payments side`, async ({ api, uid }) => {
        const marker = uid('RPP');
        const entry = await postedEntry(api, mode, 'payment', 88.5, marker);

        await report.open();
        await report.run(TODAY(), TODAY(), acc.name);
        const card = report.accountCard(acc.name);
        await report.quickFilter.fill(entry.voucherNumber);
        const row = report.entryRows(card);
        await expect(row).toHaveCount(1);
        const e = await report.entry(row);
        expect(e.payments).toBe(88.5);
        expect(e.receipts).toBe(0);
        expect(e.party).toContain(COUNTER.payment.name);
      });

      test(`${mode} entry keeps its particulars in the report`, async ({ api, uid }) => {
        const marker = uid('RPD');
        const entry = await postedEntry(api, mode, 'receipt', 5.5, marker);
        await report.open();
        await report.run(TODAY(), TODAY(), acc.name);
        await report.quickFilter.fill(entry.voucherNumber);
        const e = await report.entry(report.entryRows(report.accountCard(acc.name)));
        expect(e.particulars).toContain(marker);
      });

      test(`${mode} opening + receipts - payments = closing, running balance is consistent`, async ({ api, uid }) => {
        await postedEntry(api, mode, 'receipt', 200, uid('RPA'));
        await postedEntry(api, mode, 'payment', 30.1, uid('RPA'));

        await report.open();
        await report.run(TODAY(), TODAY(), acc.name);
        const card = report.accountCard(acc.name);
        await expect(card).toBeVisible();

        const opening = await report.openingBalance(card);
        const closing = await report.closingBalance(card);
        const header = await report.headerTotals(card);
        const footer = await report.footerTotals(card);

        expect(opening + header.receipts - header.payments).toBeCloseTo(closing, 2);
        expect(footer).toEqual({ receipts: header.receipts, payments: header.payments, closing });

        const rows = report.entryRows(card);
        const count = await rows.count();
        expect(count).toBeGreaterThanOrEqual(2);
        let running = opening;
        let receipts = 0;
        let payments = 0;
        for (let i = 0; i < count; i++) {
          const e = await report.entry(rows.nth(i));
          running += e.receipts - e.payments;
          receipts += e.receipts;
          payments += e.payments;
          expect(e.balance, `running balance after row ${i + 1}`).toBeCloseTo(running, 2);
        }
        expect(receipts).toBeCloseTo(header.receipts, 2);
        expect(payments).toBeCloseTo(header.payments, 2);
        expect(running).toBeCloseTo(closing, 2);
      });

      test(`${mode} date range includes only entries inside it`, async ({ api, uid }) => {
        const day = quietDay();
        const old = await postedEntry(api, mode, 'receipt', 41.5, uid('RPO'), { date: day });
        const recent = await postedEntry(api, mode, 'receipt', 42.5, uid('RPN'));

        await report.open();
        await report.run(day, day, acc.name);
        const card = report.accountCard(acc.name);
        await report.quickFilter.fill(old.voucherNumber);
        await expect(report.entryRows(card)).toHaveCount(1);
        await report.quickFilter.fill(recent.voucherNumber);
        await expect(report.entryRows(card).filter({ hasText: /\d/ })).toHaveCount(0);

        // Widen to cover both days: both appear, and arithmetic still holds over the longer period.
        await report.run(day, TODAY(), acc.name);
        const wide = report.accountCard(acc.name);
        await report.quickFilter.fill(old.voucherNumber);
        await expect(report.entryRows(wide)).toHaveCount(1);
        await report.quickFilter.fill(recent.voucherNumber);
        await expect(report.entryRows(wide)).toHaveCount(1);
        await report.quickFilter.fill('');
        const opening = await report.openingBalance(wide);
        const closing = await report.closingBalance(wide);
        const totals = await report.headerTotals(wide);
        expect(opening + totals.receipts - totals.payments).toBeCloseTo(closing, 2);
      });

      test(`${mode} opening balance equals the closing balance of the period before`, async ({ api, uid }) => {
        const day = quietDay(23, 42);
        await postedEntry(api, mode, 'receipt', 19.75, uid('RPB'), { date: day });
        const next = new Date(`${day}T00:00:00`);
        next.setDate(next.getDate() + 1);
        const nextDay = isoDate(Math.round((next.getTime() - new Date(`${TODAY()}T00:00:00`).getTime()) / 86_400_000));

        await report.open();
        await report.run(day, day, acc.name);
        const closing = await report.closingBalance(report.accountCard(acc.name));

        await report.run(nextDay, TODAY(), acc.name);
        const opening = await report.openingBalance(report.accountCard(acc.name));
        expect(opening).toBeCloseTo(closing, 2);
      });
    });
  }

  test('account filter limits the report to one account; clearing it shows others again', async ({ api, uid }) => {
    await postedEntry(api, 'cash', 'receipt', 3, uid('RPF'));
    await postedEntry(api, 'bank', 'receipt', 3, uid('RPF'));

    await report.open();
    await report.run(TODAY(), TODAY());
    await expect(report.accountCard(ACCOUNTS.cash.name)).toBeVisible();
    await expect(report.accountCard(ACCOUNTS.bank.name)).toBeVisible();

    await report.run(TODAY(), TODAY(), ACCOUNTS.cash.name);
    await expect(report.accountCard(ACCOUNTS.cash.name)).toBeVisible();
    await expect(report.accountCard(ACCOUNTS.bank.name)).toHaveCount(0);
    await expect(report.summaryLine).toContainText('Found 1 account(s)');

    await report.clearAccountButton.click();
    await report.afterResponse('GET', '/reports/cash-book', () => report.generate.click());
    await expect(report.accountCard(ACCOUNTS.bank.name)).toBeVisible();
  });

  test('every account card is internally consistent across the whole day', async ({ api, uid }) => {
    await postedEntry(api, 'cash', 'receipt', 60, uid('RPC'));
    await postedEntry(api, 'bank', 'receipt', 70, uid('RPC'));

    await report.open();
    await report.run(TODAY(), TODAY());
    const cards = report.page.locator('div.card').filter({ has: report.page.getByText(/^Opening Balance:/) });
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(2);
    let sumReceipts = 0;
    let sumPayments = 0;
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const opening = await report.openingBalance(card);
      const closing = await report.closingBalance(card);
      const t = await report.headerTotals(card);
      expect(opening + t.receipts - t.payments).toBeCloseTo(closing, 2);
      sumReceipts += t.receipts;
      sumPayments += t.payments;
    }
    // The summary line above the cards totals every account.
    const line = await report.summaryLine.innerText();
    const [, receipts, payments] = /Receipts:\s*₹?(-?[\d.]+),\s*Total Payments:\s*₹?(-?[\d.]+)/.exec(line) ?? [];
    expect(Number(receipts)).toBeCloseTo(sumReceipts, 2);
    expect(Number(payments)).toBeCloseTo(sumPayments, 2);
  });

  test('quick filter narrows rows, shows a counter, and reports no match', async ({ api, uid }) => {
    const a = await postedEntry(api, 'bank', 'receipt', 6.1, uid('RPQ'));
    await postedEntry(api, 'bank', 'receipt', 6.2, uid('RPQ'));

    await report.open();
    await report.run(TODAY(), TODAY(), ACCOUNTS.bank.name);
    const card = report.accountCard(ACCOUNTS.bank.name);
    const all = await report.entryRows(card).count();
    expect(all).toBeGreaterThanOrEqual(2);

    await report.quickFilter.fill(a.voucherNumber);
    await expect(report.entryRows(card)).toHaveCount(1);
    await expect(report.page.getByText(`1/${all}`)).toBeVisible();

    await report.quickFilter.fill(`${a.voucherNumber}-zzz`);
    await expect(report.page.getByText('No match')).toBeVisible();
    await expect(card.getByText('No entries found matching your search.')).toBeVisible();

    await report.page.getByTitle('Clear filter').click();
    await expect(report.quickFilter).toHaveValue('');
    await expect(report.entryRows(card)).toHaveCount(all);
  });

  test('excel export downloads an .xlsx named for the range', async ({ api, uid }) => {
    await postedEntry(api, 'cash', 'receipt', 2, uid('RPX'));
    await report.open();
    await report.run(TODAY(), TODAY(), ACCOUNTS.cash.name);
    await expect(report.excel).toBeVisible();
    const download = await report.downloadExcel();
    expect(download.suggestedFilename()).toBe(`CashBook_${TODAY()}_${TODAY()}.xlsx`);
    const path = await download.path();
    expect(path).toBeTruthy();
    const { statSync } = await import('node:fs');
    expect(statSync(path).size).toBeGreaterThan(1000);
  });

  test('print button opens the print dialog', async ({ page, api, uid }) => {
    await postedEntry(api, 'cash', 'receipt', 2, uid('RPY'));
    await page.addInitScript(() => {
      (window as unknown as { __prints: number }).__prints = 0;
      window.print = () => {
        (window as unknown as { __prints: number }).__prints += 1;
      };
    });
    await report.open();
    await report.run(TODAY(), TODAY(), ACCOUNTS.cash.name);
    await expect(report.print).toBeVisible();
    await report.print.click();
    expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
  });
});
