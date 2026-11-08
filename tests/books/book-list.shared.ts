import type { Page } from '@playwright/test';

import { expect, test } from '../../fixtures';
import { isoDate, parseMoney } from '../../support/data';
import type { BookListPage } from '../../pages/cashbook.page';

import { ACCOUNTS, COUNTER, createEntry, type Mode } from './book-data';

const LABELS = {
  cash: { receipt: 'Income/Transfer In', payment: 'Expense/Transfer Out', title: 'Cash Book' },
  bank: { receipt: 'Deposit/Transfer In', payment: 'Withdraw/Transfer Out', title: 'Bank Book' },
} as const;

function ddMMyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/** Tests for a voucher-entry list: /cashbook or /bankbook. */
export function defineBookListTests(mode: Mode, makePage: (page: Page) => BookListPage): void {
  const acc = ACCOUNTS[mode];
  const label = LABELS[mode];

  test.describe(`${label.title} list`, () => {
    let book: BookListPage;

    test.beforeEach(({ page }) => {
      book = makePage(page);
    });

    test('loads for the logged-in user with search, add and paging controls', async ({ api, uid, page }) => {
      await createEntry(api, mode, 'receipt', 9, uid('BKL'));
      await book.open();
      await expect(page).toHaveURL(new RegExp(`${book.path}$`));
      await expect(book.search).toBeVisible();
      await expect(book.loadError).toHaveCount(0);
      await expect(book.pageSize).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Amount' }).or(book.emptyState)).toBeVisible();
    });

    test('add button opens the create form', async ({ page }) => {
      await book.open();
      await book.addButton.click();
      await expect(page).toHaveURL(new RegExp(`${book.path}/new$`));
    });

    test('an approved receipt is listed with type, ledgers, amount and status', async ({ api, uid }) => {
      const marker = uid('BKR');
      const entry = await createEntry(api, mode, 'receipt', 321.45, marker);
      await book.open();
      await book.searchFor(marker);

      const row = book.row(marker);
      await expect(row).toHaveCount(1);
      const cells = await book.cells(row);
      expect(cells[0]).toBe(ddMMyyyy(entry.date));
      expect(cells[1]).toBe(label.receipt);
      expect(cells[2]).toBe(acc.name);
      expect(cells[3]).toBe(COUNTER.receipt.name);
      expect(parseMoney(cells[4] ?? '')).toBe(321.45);
      expect(cells[5]).toBe(marker);
      expect(cells[6]).toBe('APPROVED');
      await expect(book.summary).toContainText(/Showing 1 to 1\s+of\s+1/);
    });

    test('an approved payment is listed as money out', async ({ api, uid }) => {
      const marker = uid('BKP');
      await createEntry(api, mode, 'payment', 45.5, marker);
      await book.open();
      await book.searchFor(marker);

      const cells = await book.cells(book.row(marker));
      expect(cells[1]).toBe(label.payment);
      expect(cells[2]).toBe(acc.name);
      expect(cells[3]).toBe(COUNTER.payment.name);
      expect(parseMoney(cells[4] ?? '')).toBe(45.5);
      expect(cells[6]).toBe('APPROVED');
    });

    test('search finds an entry by voucher number and shows an empty state for no match', async ({ api, uid }) => {
      const marker = uid('BKS');
      const entry = await createEntry(api, mode, 'receipt', 10, marker);
      await book.open();

      await book.searchFor(entry.voucherNumber);
      await expect(book.row(marker)).toHaveCount(1);

      await book.searchFor(`${marker}-no-such-entry`);
      await expect(book.emptyState).toBeVisible();

      await book.afterResponse('GET', `${book.apiPath}?`, () => book.clearSearchButton.click());
      await expect(book.search).toHaveValue('');
      await expect(book.emptyState).toBeHidden();
    });

    test('search matches particulars', async ({ api, uid }) => {
      const marker = uid('BKQ');
      await createEntry(api, mode, 'receipt', 11, marker);
      await book.open();
      await book.searchFor(marker.toLowerCase());
      await expect(book.row(marker)).toHaveCount(1);
    });

    test('approved entry offers view and correct/reverse but not edit or delete', async ({ api, uid }) => {
      const marker = uid('BKA');
      await createEntry(api, mode, 'receipt', 12, marker);
      await book.open();
      await book.searchFor(marker);
      const row = book.row(marker);
      await expect(book.viewButton(row)).toBeVisible();
      await expect(book.reviseButton(row)).toBeVisible();
      await expect(book.editButton(row)).toHaveCount(0);
      await expect(book.deleteButton(row)).toHaveCount(0);
    });

    test('view opens the voucher', async ({ api, uid, page }) => {
      const marker = uid('BKV');
      const entry = await createEntry(api, mode, 'receipt', 13, marker);
      await book.open();
      await book.searchFor(marker);
      await book.viewButton(book.row(marker)).click();
      await expect(page).toHaveURL(new RegExp(`/vouchers/${entry.id}$`));
    });

    test('a draft can be deleted from the list', async ({ api, uid }) => {
      test.fail(true, 'Known bug: DELETE /cash-book|bank-book/:id does not exist in the API (404), so drafts cannot be deleted.');
      const marker = uid('BKD');
      const entry = await createEntry(api, mode, 'receipt', 14, marker, { approve: false });
      await book.open();
      await book.searchFor(marker);
      const row = book.row(marker);
      expect((await book.cells(row))[6]).toBe('DRAFT');
      await expect(book.editButton(row)).toBeVisible();
      await expect(book.reviseButton(row)).toHaveCount(0);

      book.acceptNextDialog();
      const deleted = await book.afterResponse('DELETE', `${book.apiPath}/${entry.id}`, () =>
        book.deleteButton(row).click(),
      );
      // BUG (ecommerce-api): the UI calls DELETE {book}/:id but neither controller defines @Delete.
      expect(deleted.status(), await deleted.text()).toBeLessThan(300);
      await expect(book.row(marker)).toHaveCount(0);

      const after = await api.get(book.apiPath, { page: 1, pageSize: 5, search: marker });
      expect(after.total).toBe(0);
    });

    test('entries are dated as created', async ({ api, uid }) => {
      const marker = uid('BKT');
      const date = isoDate(-2);
      await createEntry(api, mode, 'receipt', 15, marker, { date });
      await book.open();
      await book.searchFor(marker);
      expect((await book.cells(book.row(marker)))[0]).toBe(ddMMyyyy(date));
    });
  });
}
