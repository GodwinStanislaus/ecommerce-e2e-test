import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/** Purchase invoice list, create form and view. */
export class PurchaseInvoicePage extends AppPage {
  // list
  readonly search: Locator;
  readonly tabUnpaid: Locator;
  readonly tabPartial: Locator;
  readonly tabPaid: Locator;
  readonly tabAll: Locator;

  // form
  readonly supplier: Locator;
  readonly billNo: Locator;
  readonly create: Locator;
  readonly submitError: Locator;
  readonly productSearch: Locator;
  readonly qty: Locator;
  readonly rate: Locator;

  // view
  readonly recordPayment: Locator;
  readonly correct: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder('Search by invoice number or supplier…');
    this.tabUnpaid = page.getByRole('button', { name: 'Unpaid', exact: true });
    this.tabPartial = page.getByRole('button', { name: 'Partial', exact: true });
    this.tabPaid = page.getByRole('button', { name: 'Paid', exact: true });
    this.tabAll = page.getByRole('button', { name: 'All', exact: true });

    this.supplier = page.getByPlaceholder('Search supplier…');
    this.billNo = page.getByRole('textbox', { name: 'Bill No *' });
    this.create = page.getByRole('button', { name: 'Create', exact: true });
    this.submitError = page.getByRole('alert');
    this.productSearch = page.getByPlaceholder('Search product…').first();
    const itemRow = page.locator('table tbody tr').filter({ has: this.productSearch });
    this.qty = itemRow.locator('input[formcontrolname="billedQuantity"]');
    this.rate = itemRow.locator('input[formcontrolname="purchaseRate"]');

    this.recordPayment = page.getByRole('button', { name: 'Record Payment' });
    this.correct = page.getByRole('button', { name: 'Correct' });
  }

  async gotoList(): Promise<void> {
    await this.goto('/purchase-invoices');
    await expect(this.search).toBeVisible();
  }

  async gotoNew(): Promise<void> {
    await this.goto('/purchase-invoices/new');
    await expect(this.supplier).toBeVisible();
  }

  async gotoView(id: string): Promise<void> {
    await this.goto(`/purchase-invoices/${id}`);
  }

  /** Row by the supplier's bill number (unique per test). */
  rowByBill(billNo: string): Locator {
    return this.rowContaining(billNo);
  }

  async pickSupplier(name: string): Promise<void> {
    await this.supplier.fill(name);
    await this.page.getByRole('button', { name }).first().click();
  }

  async pickProduct(name: string): Promise<void> {
    await this.productSearch.fill(name);
    await this.page.getByRole('button', { name: new RegExp(`^${escape(name)}\\b`) }).first().click();
  }
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
