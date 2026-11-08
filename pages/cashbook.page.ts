import { expect, type Download, type Locator, type Page } from '@playwright/test';

import { parseMoney } from '../support/data';

import { AppPage } from './app.page';

/**
 * Shared behaviour of the two voucher-entry lists (/cashbook and /bankbook):
 * search box, add button, paged table with status badges and per-row actions.
 */
export class BookListPage extends AppPage {
  readonly search: Locator;
  readonly clearSearchButton: Locator;
  readonly addButton: Locator;
  readonly emptyState: Locator;
  readonly pageSize: Locator;
  readonly summary: Locator;
  readonly loadError: Locator;

  constructor(
    page: Page,
    readonly path: string,
    readonly addLabel: RegExp,
    readonly emptyText: RegExp,
    readonly apiPath: string,
  ) {
    super(page);
    this.search = page.getByPlaceholder(/^Search by date, type, ledger/);
    this.clearSearchButton = page.getByTitle('Clear', { exact: true });
    this.addButton = page.getByRole('button', { name: this.addLabel });
    this.emptyState = page.getByText(this.emptyText);
    // The cash book's <select> is not tied to its "Rows per page:" label (the bank book's is), so match by role only.
    this.pageSize = page.locator('select').filter({ has: page.getByRole('option', { name: '50' }) });
    this.summary = page.getByText(/Showing \d+ to\s+\d+\s+of\s+\d+/);
    this.loadError = page.getByRole('alert');
  }

  async open(): Promise<void> {
    await this.goto(this.path);
    await expect(this.addButton).toBeVisible();
  }

  /** Types in the search box and waits for the debounced list request to come back. */
  async searchFor(term: string): Promise<void> {
    await this.afterResponse('GET', `${this.apiPath}?`, () => this.search.fill(term));
  }

  /** Row whose text contains the unique marker (particulars or voucher number). */
  row(marker: string): Locator {
    return this.rowContaining(marker);
  }

  /** Cell texts of a row, in column order: Date, Type, ledger, counter ledger, Amount, Particulars, Status, Actions. */
  async cells(row: Locator): Promise<string[]> {
    return (await row.locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  }

  viewButton(row: Locator): Locator {
    return row.getByTitle('View', { exact: true });
  }
  editButton(row: Locator): Locator {
    return row.getByTitle('Edit', { exact: true });
  }
  deleteButton(row: Locator): Locator {
    return row.getByTitle('Delete', { exact: true });
  }
  reviseButton(row: Locator): Locator {
    return row.getByTitle('Correct or reverse', { exact: true });
  }
}

export class CashbookPage extends BookListPage {
  constructor(page: Page) {
    super(page, '/cashbook', /Add Cash Book/, /No cash book entries found/, '/cash-book');
  }
}

/** "Cash & Bank Book" report at /reports/cash-book: opening/closing balance per cash or bank account. */
export class CashBookReportPage extends AppPage {
  readonly path = '/reports/cash-book';
  readonly fromDate: Locator;
  readonly toDate: Locator;
  readonly accountInput: Locator;
  readonly clearAccountButton: Locator;
  readonly generate: Locator;
  readonly excel: Locator;
  readonly print: Locator;
  readonly quickFilter: Locator;
  readonly emptyPrompt: Locator;
  readonly summaryLine: Locator;

  constructor(page: Page) {
    super(page);
    // NOTE: icon-only buttons (View/Edit/Delete/Clear) expose no accessible name, only a title, so they are found by title.
    // The visible <label for="fromDateBtn"> points at the calendar button, so the date inputs have no accessible name.
    this.fromDate = page.locator('#fromDate');
    this.toDate = page.locator('#toDate');
    this.accountInput = page.getByPlaceholder('Search Cash/Bank account...');
    this.clearAccountButton = page.locator('app-cash-book form button:has(i.bi-x)');
    this.generate = page.getByRole('button', { name: 'Generate' });
    this.excel = page.getByRole('button', { name: 'Excel' });
    this.print = page.getByRole('button', { name: 'Print' });
    this.quickFilter = page.getByPlaceholder('Filter rows…');
    this.emptyPrompt = page.getByRole('heading', { name: 'Select a date range and click Generate' });
    this.summaryLine = page.getByText(/Found \d+ account\(s\)\./);
  }

  async open(): Promise<void> {
    await this.goto(this.path);
    await expect(this.generate).toBeVisible();
  }

  async run(from: string, to: string, accountName?: string): Promise<void> {
    await this.fromDate.fill(from);
    await this.toDate.fill(to);
    if (accountName) {
      await this.accountInput.fill(accountName);
      await this.page.getByRole('option', { name: new RegExp(escapeRe(accountName)) }).first().click();
    }
    await this.afterResponse('GET', '/reports/cash-book', () => this.generate.click());
  }

  /** The card for one account (found by its heading). */
  accountCard(accountName: string): Locator {
    return this.page
      .locator('div.card')
      .filter({ has: this.page.getByRole('heading', { name: accountName, exact: true }) });
  }

  async openingBalance(card: Locator): Promise<number> {
    return moneyIn(card.getByText('Opening Balance:').locator('..').locator('strong'));
  }
  async closingBalance(card: Locator): Promise<number> {
    return moneyIn(card.getByText('Closing Balance:').locator('..').locator('strong'));
  }

  /** "Receipts: ₹x" / "Payments: ₹y" badges in the card header. */
  async headerTotals(card: Locator): Promise<{ receipts: number; payments: number }> {
    const receipts = await card.getByText(/Receipts:\s*₹/).innerText();
    const payments = await card.getByText(/Payments:\s*₹/).innerText();
    return { receipts: num(receipts), payments: num(payments) };
  }

  /** Footer ("Total for …") receipts / payments / closing. */
  async footerTotals(card: Locator): Promise<{ receipts: number; payments: number; closing: number }> {
    const cells = await card.locator('tfoot td').allInnerTexts();
    // [label, receipts, payments, closing, user]
    return { receipts: num(cells[1] ?? ''), payments: num(cells[2] ?? ''), closing: num(cells[3] ?? '') };
  }

  entryRows(card: Locator): Locator {
    return card.locator('tbody tr');
  }

  /** Entry row by unique text (voucher number or particulars). */
  entryRow(card: Locator, marker: string | RegExp): Locator {
    return this.entryRows(card).filter({ hasText: marker });
  }

  /** Parsed entry row: columns are Date, Type, Particulars, Party, "Credit"(=receipts), "Debit"(=payments), Cl Bal, User. */
  async entry(row: Locator): Promise<{
    date: string;
    type: string;
    particulars: string;
    party: string;
    receipts: number;
    payments: number;
    balance: number;
  }> {
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    return {
      date: c[0] ?? '',
      type: c[1] ?? '',
      particulars: c[2] ?? '',
      party: c[3] ?? '',
      receipts: num(c[4] ?? ''),
      payments: num(c[5] ?? ''),
      balance: num(c[6] ?? ''),
    };
  }

  async downloadExcel(): Promise<Download> {
    const download = this.page.waitForEvent('download');
    await this.excel.click();
    return download;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const num = parseMoney;

async function moneyIn(locator: Locator): Promise<number> {
  return num(await locator.innerText());
}
