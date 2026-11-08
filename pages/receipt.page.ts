import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/** Customer receipts: list (/receipt), create (/receipt/new) and view (/receipt/:id/view). */
export class ReceiptPage extends AppPage {
  // list
  readonly search: Locator;
  readonly newReceiptButton: Locator;
  readonly emptyState: Locator;
  // create
  readonly customerInput: Locator;
  readonly receiptDate: Locator;
  readonly amount: Locator;
  readonly method: Locator;
  readonly reference: Locator;
  readonly bank: Locator;
  readonly submit: Locator;
  readonly formError: Locator;
  readonly successAlert: Locator;
  // view
  readonly viewHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder(/Search receipt number or invoice/);
    this.newReceiptButton = page.getByTitle('Create new receipt');
    this.emptyState = page.getByText('No receipts found');
    this.customerInput = page.getByPlaceholder(/Search by name, GSTIN/);
    this.receiptDate = page.locator('#receiptDate');
    this.amount = page.getByLabel('Amount');
    this.method = page.getByLabel('Payment Method');
    this.reference = page.getByLabel('Reference');
    this.bank = page.getByLabel('Our Bank');
    this.submit = page.locator('form button[type="submit"]');
    this.formError = page.locator('.alert-danger');
    this.successAlert = page.locator('.alert-success');
    this.viewHeading = page.getByRole('heading', { level: 1 });
  }

  async gotoList(): Promise<void> {
    await this.goto('/receipt');
    await expect(this.newReceiptButton).toBeVisible();
  }

  async gotoNew(): Promise<void> {
    await this.goto('/receipt/new');
    await expect(this.customerInput).toBeVisible();
  }

  async gotoNewForInvoice(customerId: string, invoiceId: string): Promise<void> {
    await this.page.goto(`/receipt/new?customerId=${customerId}&invoiceId=${invoiceId}`);
    await expect(this.amount).toBeVisible();
  }

  async gotoView(receiptId: string): Promise<void> {
    await this.page.goto(`/receipt/${receiptId}/view`);
    await expect(this.viewHeading).toBeVisible();
  }

  async searchFor(text: string): Promise<void> {
    await this.afterResponse('GET', '/receipt/list', () => this.search.fill(text));
  }

  async pickCustomer(name: string): Promise<void> {
    await this.customerInput.fill(name);
    await this.page.locator('.list-group-item').filter({ hasText: name }).first().click();
    await expect(this.page.getByRole('button', { name: 'Change customer' })).toBeVisible();
  }

  invoiceRow(invoiceNumber: string): Locator {
    return this.page.locator('tr.invoice-row-selectable').filter({ has: this.page.getByRole('cell', { name: invoiceNumber, exact: true }) });
  }

  /** Selects the invoice unless the screen already auto-selected it (single pending invoice). */
  async selectInvoice(invoiceNumber: string): Promise<void> {
    const row = this.invoiceRow(invoiceNumber);
    await expect(row).toBeVisible();
    const checkbox = row.getByRole('checkbox');
    if (!(await checkbox.isChecked())) {
      await row.click();
    }
    await expect(checkbox).toBeChecked();
  }

  async fillPayment(opts: { amount?: number; method: string; reference?: string; bank?: string }): Promise<void> {
    if (opts.amount !== undefined) {
      await this.amount.fill(String(opts.amount));
    }
    await this.method.selectOption(opts.method);
    if (opts.reference !== undefined) {
      await this.reference.fill(opts.reference);
    }
    if (opts.bank) {
      await this.bank.selectOption({ label: opts.bank });
    }
  }

  /** Clicks submit and resolves with the POST /receipt response. */
  async submitReceipt() {
    return this.afterResponse('POST', /\/receipt$/, () => this.submit.click());
  }

  allocationRow(invoiceNumber: string): Locator {
    return this.page.locator('.allocation-row').filter({ hasText: invoiceNumber });
  }
}
