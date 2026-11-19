import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/** Users list (/users, staff tab by default) and the edit screen (/users/:id/edit) with its Digital Signature card. */
export class UserPage extends AppPage {
  readonly signatureFile: Locator;
  readonly signaturePreview: Locator;
  readonly removeSignature: Locator;
  readonly signatureError: Locator;

  constructor(page: Page) {
    super(page);
    // The input's label flips between "Upload signature" and "Replace signature" once one exists.
    this.signatureFile = page.getByLabel(/^(Upload|Replace) signature$/);
    this.signaturePreview = page.getByRole('img', { name: 'Signature', exact: true });
    this.removeSignature = page.getByRole('button', { name: 'Remove', exact: true });
    this.signatureError = page.locator('.text-danger.small');
  }

  async gotoList(): Promise<void> {
    await this.goto('/users');
    await expect(this.page.getByRole('columnheader', { name: 'Signature' })).toBeVisible();
  }

  async gotoEdit(id: string): Promise<void> {
    await this.goto(`/users/${id}/edit`);
    await expect(this.signatureFile).toBeVisible();
  }

  /** Row of the staff list for this user name. */
  row(name: string): Locator {
    return this.tableRows().filter({ has: this.page.getByRole('cell', { name, exact: true }) });
  }

  /** Picks a file on the signature input and resolves with the API response when the upload is sent. */
  async upload(file: { name: string; mimeType: string; buffer: Buffer }, userId: string) {
    return this.afterResponse('POST', `/user/${userId}/signature`, () => this.signatureFile.setInputFiles(file));
  }
}
