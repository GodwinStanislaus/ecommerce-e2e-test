import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/** Year-End Closing wizard: select year, preview, confirm. */
export class YearEndClosingPage extends AppPage {
  readonly yearSelect: Locator;
  readonly next: Locator;
  readonly proceed: Locator;
  readonly execute: Locator;
  readonly back: Locator;

  constructor(page: Page) {
    super(page);
    // The navbar's page search is a combobox too, so take the <select>
    this.yearSelect = page.locator('select');
    this.next = page.getByRole('button', { name: 'Next: Preview Closing Entries' });
    this.proceed = page.getByRole('button', { name: 'Proceed to Close' });
    this.execute = page.getByRole('button', { name: 'Execute Year-End Close' });
    this.back = page.getByRole('button', { name: 'Back' });
  }

  async open(): Promise<void> {
    await this.goto('/accounting/year-end-closing');
  }

  /** Option for a fiscal year, e.g. "FY2000-01 — OPEN". */
  yearOption(label: string): Locator {
    return this.yearSelect.locator('option').filter({ hasText: label });
  }

  async selectYear(label: string): Promise<void> {
    await expect(this.yearOption(label)).toHaveCount(1);
    await this.yearSelect.selectOption({ label: (await this.yearOption(label).innerText()).trim() });
  }

  async preview(label: string): Promise<void> {
    await this.selectYear(label);
    await this.next.click();
    await expect(this.page.getByText(`Closing Entries Preview — ${label}`)).toBeVisible();
  }

  /** The row of the preview table that mentions the text. */
  previewRow(text: string | RegExp): Locator {
    return this.rowContaining(text);
  }

  /** "Net Profit → Retained Earnings" / "Net Loss → …" banner. */
  netBanner(kind: 'Profit' | 'Loss'): Locator {
    return this.page.locator('div.fw-bold').filter({ hasText: `Net ${kind} → Retained Earnings` });
  }
}
