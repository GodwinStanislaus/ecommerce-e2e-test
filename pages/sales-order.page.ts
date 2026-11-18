import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/** Sales orders: list (/sales-orders), create form (/sales-orders/new) and detail view (/sales-orders/:id). */
export class SalesOrderPage extends AppPage {
  // List
  readonly newOrderButton: Locator;
  readonly listSearch: Locator;
  readonly allOrdersTab: Locator;

  // Form
  readonly customerSearch: Locator;
  readonly productSearch: Locator;
  readonly saveButton: Locator;
  readonly validationAlert: Locator;
  readonly quantityInput: Locator;

  // Freight card (<so-freight>)
  readonly freightCard: Locator;
  readonly freightOverrideButton: Locator;
  readonly manualFreightInput: Locator;
  /** Manual freight GST %: read-only, always the rate the API applies. */
  readonly manualFreightGstRate: Locator;

  // View
  readonly confirmButton: Locator;
  readonly actionsMenu: Locator;
  readonly statusBadge: Locator;

  constructor(page: Page) {
    super(page);
    this.newOrderButton = page.getByRole('button', { name: /new order/i });
    this.listSearch = page.getByPlaceholder(/search orders by number or customer/i);
    this.allOrdersTab = page.getByRole('button', { name: /all orders/i });

    this.customerSearch = page.getByPlaceholder(/search customer/i);
    this.productSearch = page.getByPlaceholder(/search product/i);
    this.saveButton = page.getByRole('button', { name: /save order/i });
    this.validationAlert = page.getByRole('alert').filter({ hasText: 'Please fix the following' });
    this.quantityInput = page.getByTitle('Quantity');

    this.freightCard = page.locator('so-freight');
    this.freightOverrideButton = this.freightCard.getByRole('button', { name: /override/i });
    this.manualFreightInput = this.freightCard.getByPlaceholder('0.00');
    this.manualFreightGstRate = this.freightCard.locator('input[readonly]');

    this.confirmButton = page.getByRole('button', { name: /confirm order/i });
    this.actionsMenu = page.getByRole('button', { name: /actions/i });
    this.statusBadge = page.locator('.status-badge');
  }

  async gotoList(): Promise<void> {
    await this.goto('/sales-orders');
  }

  async gotoNew(): Promise<void> {
    await this.goto('/sales-orders/new');
    await expect(this.customerSearch).toBeVisible();
  }

  async gotoOrder(id: string): Promise<void> {
    await this.goto(`/sales-orders/${id}`);
  }

  async selectCustomer(name: string): Promise<void> {
    await this.customerSearch.fill(name);
    await this.page.locator('.list-group-item', { hasText: name }).first().click();
    // Customer details (and the shipping address picker) load after selection; saving earlier is a race.
    await expect(this.page.locator('select.form-select').first()).toBeVisible();
  }

  async addProduct(name: string, quantity: number): Promise<void> {
    const lineCount = await this.quantityInput.count();
    await this.productSearch.fill(name);
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
    await this.page.locator('.list-group-item', { hasText: name }).first().click();
    await expect(this.quantityInput).toHaveCount(lineCount + 1);
    await this.quantityInput.last().fill(String(quantity));
    await expect(this.quantityInput.last()).toHaveValue(String(quantity));
  }

  /** Clicks Save and returns the created order from the POST /order response. */
  async saveNew(): Promise<{ id: string; orderNumber: string }> {
    const res = await this.afterResponse('POST', /\/order$/, () => this.saveButton.click());
    expect(res.status()).toBe(201);
    return res.json();
  }

  /** Confirm button -> modal "Confirm Order" -> PATCH /order/:id/confirm. */
  async confirmFromView(): Promise<void> {
    await this.confirmButton.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toContainText('Are you sure you want to confirm this order');
    const res = await this.afterResponse('PATCH', '/confirm', () =>
      dialog.getByRole('button', { name: /confirm order/i }).click(),
    );
    expect(res.ok()).toBeTruthy();
  }

  orderRow(orderNumber: string): Locator {
    return this.rowContaining(orderNumber);
  }
}
