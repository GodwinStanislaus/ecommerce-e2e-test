import { expect, type Locator, type Page, type Response } from '@playwright/test';

/** Behaviour shared by every screen: navigation, toasts, tables, API waits. Module pages extend this. */
export class AppPage {
  constructor(readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await expect(this.page).toHaveURL(new RegExp(`${escapeRegExp(path.split('?')[0] ?? path)}`));
  }

  /** Visible toast / alert containing the text. */
  toast(text: string | RegExp): Locator {
    return this.page.locator('.toast, .alert, [role="alert"], [role="status"]').filter({ hasText: text });
  }

  /** Rows of the main data table (header excluded). */
  tableRows(): Locator {
    return this.page.locator('table tbody tr');
  }

  rowContaining(text: string | RegExp): Locator {
    return this.tableRows().filter({ hasText: text });
  }

  button(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name });
  }

  /**
   * Runs `action` and resolves with the first API response matching method + URL fragment.
   * Use instead of timeouts: `await app.afterResponse('POST', '/sales-orders', () => save.click())`.
   */
  async afterResponse(method: string, urlPart: string | RegExp, action: () => Promise<unknown>): Promise<Response> {
    const response = this.page.waitForResponse(
      (r) =>
        r.request().method() === method.toUpperCase() &&
        (typeof urlPart === 'string' ? r.url().includes(urlPart) : urlPart.test(r.url())),
    );
    await action();
    return response;
  }

  /** Accepts the next native confirm/alert dialog. */
  acceptNextDialog(): void {
    this.page.once('dialog', (dialog) => void dialog.accept());
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
