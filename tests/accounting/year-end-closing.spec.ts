import { expect, test } from '../../fixtures';
import { YearEndClosingPage } from '../../pages/year-end-closing.page';
import {
  closePeriods,
  createFreeFiscalYear,
  fyLabel,
  journalAccounts,
  listFiscalYears,
  listPeriods,
  postJournal,
  type FiscalYear,
} from '../../support/fiscal-year';

const REVENUE = 80_000;
const EXPENSE = 30_000;
const NET_PROFIT = '50,000.00'; // as the preview table shows it
const NET_PROFIT_PLAIN = '50000.00'; // as the success message shows it

/**
 * Year-end close is irreversible and each run uses up a fiscal year (the lowest
 * unused one from 2000), so the closing scenarios only run when asked for:
 *   E2E_YEAR_END=1 ./scripts/with-env.sh npx playwright test tests/accounting
 * The login must be an admin: the journals are back-dated into that year.
 */
const optedIn = process.env['E2E_YEAR_END'] === '1';

test.describe('Year-end closing: route', () => {
  test('the old bare fiscal-year lock route is gone', async ({ api }) => {
    const res = await api.raw().patch('/financial-periods/fiscal-year/1/lock');

    expect(res.status()).toBe(404);
  });
});

test.describe('Year-end closing: scenarios', () => {
  // Each scenario takes the next free year, so they must not race for it
  test.describe.configure({ mode: 'serial' });
  test.skip(!optedIn, 'Irreversible: set E2E_YEAR_END=1 to run');

  /** A fresh year with a revenue and an expense journal posted in it. */
  async function arrangeYear(api: Parameters<typeof createFreeFiscalYear>[0]) {
    const accounts = await journalAccounts(api);
    test.skip(!accounts, 'Seed chart lacks Sales (4100), Miscellaneous Expenses (5101) or a cash account');
    const { revenue, expense, cash } = accounts!;

    const { fy, startYear } = await createFreeFiscalYear(api);
    await postJournal(api, {
      date: `${startYear}-08-15`,
      debitAccountId: cash.accountId,
      creditAccountId: revenue.accountId,
      amount: REVENUE,
      narration: `E2E year-end revenue ${fyLabel(startYear)}`,
    });
    await postJournal(api, {
      date: `${startYear}-09-10`,
      debitAccountId: expense.accountId,
      creditAccountId: cash.accountId,
      amount: EXPENSE,
      narration: `E2E year-end expense ${fyLabel(startYear)}`,
    });
    return { fy, label: fyLabel(startYear) };
  }

  const statusOf = async (api: Parameters<typeof listFiscalYears>[0], id: number) =>
    (await listFiscalYears(api)).find((f) => f.id === id)!;

  test('refuses to close while a period is still open', async ({ page, api }) => {
    const { fy, label } = await arrangeYear(api);
    const yec = new YearEndClosingPage(page);

    await yec.open();
    await yec.preview(label);
    await yec.proceed.click();
    await yec.execute.click();

    await expect(yec.toast(/period\(s\) are still OPEN/)).toBeVisible();
    expect((await statusOf(api, fy.id)).isLocked).toBe(false);
  });

  test('previews, closes and locks the year without touching the others', async ({ page, api }) => {
    const { fy, label } = await arrangeYear(api);
    await closePeriods(api, fy.id);
    const othersBefore = (await listFiscalYears(api)).filter((f) => f.id !== fy.id);
    const yec = new YearEndClosingPage(page);

    await test.step('preview shows the zero-out and the net profit', async () => {
      await yec.open();
      await yec.preview(label);

      await expect(yec.previewRow('Retained Earnings')).toBeVisible();
      await expect(yec.netBanner('Profit')).toContainText(NET_PROFIT);
    });

    await test.step('confirm and execute the close', async () => {
      await yec.proceed.click();
      await expect(page.getByText('permanently close')).toContainText(label);

      const response = await yec.afterResponse('POST', `/year-end-closing/${fy.id}/close`, () => yec.execute.click());
      expect(response.status()).toBe(201);
      await expect(yec.toast(`Year-end close completed for ${label}. Net profit ${NET_PROFIT_PLAIN}`)).toBeVisible();
    });

    await test.step('the year and every period are locked', async () => {
      expect((await statusOf(api, fy.id)).status).toBe('LOCKED');
      const periods = await listPeriods(api, fy.id);
      expect(periods).toHaveLength(12);
      expect(periods.every((p) => p.status === 'LOCKED')).toBe(true);
    });

    await test.step('other fiscal years keep their status', async () => {
      const othersAfter = (await listFiscalYears(api)).filter((f) => f.id !== fy.id);
      expect(othersAfter.map(({ id, status }) => ({ id, status }))).toEqual(
        othersBefore.map(({ id, status }) => ({ id, status })),
      );
    });

    await test.step('nothing can be posted into the locked year', async () => {
      const accounts = (await journalAccounts(api))!;
      const res = await api.raw().post('/journal', {
        data: {
          entryDate: `${label.slice(2, 6)}-10-01T10:00:00+05:30`,
          lines: [
            { accountId: accounts.cash.accountId, debitAmount: 1, creditAmount: 0 },
            { accountId: accounts.revenue.accountId, debitAmount: 0, creditAmount: 1 },
          ],
        },
      });
      expect(res.status()).toBe(422);
    });

    await test.step('the locked year can no longer be picked', async () => {
      await yec.open();
      await expect(yec.yearOption(label)).toBeDisabled();
    });
  });

  test('closes a year whose last period was locked by hand', async ({ page, api }) => {
    const { fy, label } = await arrangeYear(api);
    const periods = await listPeriods(api, fy.id);
    const last = periods[periods.length - 1]!;
    await closePeriods(api, fy.id, last.id);
    await api.patch(`/financial-periods/${last.id}/lock`);
    const yec = new YearEndClosingPage(page);

    await yec.open();
    await yec.preview(label);
    await yec.proceed.click();
    await yec.execute.click();

    await expect(yec.toast(`Year-end close completed for ${label}. Net profit ${NET_PROFIT_PLAIN}`)).toBeVisible();
    const locked: FiscalYear = await statusOf(api, fy.id);
    expect(locked.status).toBe('LOCKED');
    expect((await listPeriods(api, fy.id)).every((p) => p.status === 'LOCKED')).toBe(true);
  });
});
