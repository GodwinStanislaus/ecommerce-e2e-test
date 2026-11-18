import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/** Purchase payments: list (/purchase-payments), create (/new, optional ?invoiceId=) and view (/:id/view). */
export class PurchasePaymentPage extends AppPage {
  // list
  readonly search: Locator;
  readonly recordPaymentButton: Locator;
  readonly emptyState: Locator;
  // create
  readonly supplierInput: Locator;
  readonly paymentDate: Locator;
  readonly amount: Locator;
  readonly method: Locator;
  readonly bankAccount: Locator;
  readonly reference: Locator;
  readonly submit: Locator;
  readonly submitError: Locator;
  // view
  readonly viewHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder(/Search by payment number/);
    this.recordPaymentButton = page.getByRole('button', { name: 'Record Payment' }).first();
    this.emptyState = page.getByText('No payments found');
    this.supplierInput = page.getByRole('combobox', { name: 'Supplier', exact: true });
    this.paymentDate = page.getByLabel('Payment Date');
    this.amount = page.getByLabel(/^Amount/);
    this.method = page.getByLabel(/^Method/);
    this.bankAccount = page.getByLabel(/^Bank Account/);
    this.reference = page.getByLabel('Reference No');
    this.submit = page.locator('form button[type="submit"]');
    this.submitError = page.locator('.alert-danger');
    this.viewHeading = page.getByRole('heading', { level: 1 });
  }

  async gotoList(): Promise<void> {
    await this.goto('/purchase-payments');
    await expect(this.recordPaymentButton).toBeVisible();
  }

  async gotoNew(): Promise<void> {
    await this.goto('/purchase-payments/new');
    await expect(this.supplierInput).toBeVisible();
  }

  async gotoNewForInvoice(invoiceId: string): Promise<void> {
    await this.page.goto(`/purchase-payments/new?invoiceId=${invoiceId}`);
    await expect(this.amount).toBeVisible();
  }

  async gotoView(paymentId: string): Promise<void> {
    await this.page.goto(`/purchase-payments/${paymentId}/view`);
    await expect(this.viewHeading).toBeVisible();
  }

  async searchFor(text: string): Promise<void> {
    // Wait for the response that carries the term: the list's first load may still be in flight.
    const wanted = encodeURIComponent(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await this.afterResponse('GET', new RegExp(`/payment/list\\?.*${wanted}`), () => this.search.fill(text));
  }

  /** Types in the supplier typeahead and picks the exact match. */
  async pickSupplier(name: string): Promise<void> {
    await this.supplierInput.fill(name);
    const option = this.page.getByRole('option').filter({ hasText: name });
    await option.first().click();
    await expect(this.page.getByText('Outstanding Invoices & Bills')).toBeVisible();
  }

  invoiceRow(invoiceNumber: string): Locator {
    return this.page.locator('tr.invoice-row-selectable').filter({ hasText: invoiceNumber });
  }

  async selectInvoice(invoiceNumber: string): Promise<void> {
    const row = this.invoiceRow(invoiceNumber);
    await expect(row).toBeVisible();
    // A supplier with exactly one unpaid invoice gets it auto-selected; only toggle when needed.
    const checkbox = row.getByRole('checkbox');
    if (!(await checkbox.isChecked())) {
      await row.click();
    }
    await expect(checkbox).toBeChecked();
  }

  async fillPayment(opts: { amount?: number; method: string; bank?: string; reference?: string }): Promise<void> {
    if (opts.amount !== undefined) {
      await this.amount.fill(String(opts.amount));
    }
    await this.method.selectOption(opts.method);
    if (opts.bank) {
      await this.bankAccount.selectOption({ label: opts.bank });
    }
    if (opts.reference !== undefined) {
      await this.reference.fill(opts.reference);
    }
  }

  /** Clicks the submit button and resolves with the POST /payment response. */
  async submitPayment() {
    return this.afterResponse('POST', /\/payment$/, () => this.submit.click());
  }

  allocationRow(invoiceNumber: string): Locator {
    return this.page.locator('.allocation-row').filter({ hasText: invoiceNumber });
  }
}
