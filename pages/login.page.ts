import { expect, type Locator, type Page } from '@playwright/test';

export class LoginPage {
  readonly mobile: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;
  readonly workspaceHeading: Locator;

  constructor(private readonly page: Page) {
    this.mobile = page.getByLabel('Mobile number');
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: /^sign in/i });
    this.error = page.getByRole('alert');
    this.workspaceHeading = page.getByRole('heading', { name: 'Choose a business' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.submit).toBeVisible();
  }

  async fill(mobile: string, password: string): Promise<void> {
    await this.mobile.fill(mobile);
    await this.password.fill(password);
  }

  /** Signs in and, when the account has several businesses, picks one (first listed if none named). */
  async signIn(mobile: string, password: string, business = ''): Promise<void> {
    await this.fill(mobile, password);
    await this.submit.click();

    const landed = this.page.waitForURL((url) => !url.pathname.startsWith('/login'));
    const picker = this.workspaceHeading.waitFor();
    await Promise.race([landed, picker]);

    if (await this.workspaceHeading.isVisible()) {
      const items = this.page.getByRole('listitem').getByRole('button');
      const choice = business ? items.filter({ hasText: new RegExp(business, 'i') }).first() : items.first();
      await choice.click();
      await landed;
    }
  }
}
