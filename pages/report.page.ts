import { expect, type Download, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/**
 * Shared toolbar of every report screen: back link -> filters -> Generate -> Excel -> Print,
 * plus the client-side quick filter above the table (see ecommerce-bolt .github/copilot-instructions.md).
 */
export class ReportPage extends AppPage {
  readonly back: Locator;
  readonly generate: Locator;
  readonly excel: Locator;
  readonly print: Locator;
  readonly quickFilter: Locator;
  /** "matched/total" counter next to the quick filter (no role or label, so located by its class). */
  readonly quickFilterCount: Locator;
  readonly fromDate: Locator;
  readonly toDate: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    super(page);
    this.back = page.locator('main a[href="/reports"]');
    this.generate = page.getByRole('button', { name: 'Generate' });
    this.excel = page.getByRole('button', { name: 'Excel' });
    this.print = page.getByRole('button', { name: 'Print' });
    this.quickFilter = page.getByPlaceholder('Filter rows…');
    this.quickFilterCount = page.locator('app-table-quick-filter .qf-count');
    this.fromDate = page.locator('#fromDate');
    this.toDate = page.locator('#toDate');
    this.error = page.locator('main .alert-danger');
  }

  async open(slug: string): Promise<void> {
    await this.goto(`/reports/${slug}`);
    await expect(this.generate).toBeVisible();
  }

  /** window.print() would block headless; count calls instead. Call before triggering Print. */
  async stubPrint(): Promise<void> {
    await this.page.evaluate(() => {
      (window as unknown as { __prints: number }).__prints = 0;
      window.print = () => {
        (window as unknown as { __prints: number }).__prints += 1;
      };
    });
  }

  async printCalls(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __prints?: number }).__prints ?? 0);
  }

  async downloadExcel(): Promise<Download> {
    const download = this.page.waitForEvent('download');
    await this.excel.click();
    return download;
  }

  /** Sets a native date input (yyyy-mm-dd) the way a user would, via the field itself. */
  async setDate(input: Locator, iso: string): Promise<void> {
    await input.fill(iso);
  }

  /** Report data rows. */
  dataRows(): Locator {
    return this.page.locator('main table tbody tr');
  }

  /** Label -> input control for a toolbar filter, via the visible label text. */
  label(text: string): Locator {
    return this.page.getByText(text, { exact: true }).first();
  }
}
