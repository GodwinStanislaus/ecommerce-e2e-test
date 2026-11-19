import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

export type PurchaseOrderTab = 'Draft' | 'Confirmed' | 'Cancelled' | 'All';

/** Purchase orders: list (/purchase-orders), form (/new, /:id/edit) and view (/:id). */
export class PurchaseOrderPage extends AppPage {
  // List
  readonly search: Locator;
  readonly newOrderLink: Locator;
  readonly scanBillButton: Locator;
  readonly scanBillInput: Locator;
  readonly billsToMapLink: Locator;
  readonly sourceFilter: Locator;

  // Form
  readonly supplierInput: Locator;
  readonly poDate: Locator;
  readonly dueDate: Locator;
  readonly brokerName: Locator;
  readonly transporter: Locator;
  readonly vehicleNo: Locator;
  readonly ewayBill: Locator;
  readonly supplierInvoice: Locator;
  readonly addItemButton: Locator;
  /** Service lines (Freight, Insurance): SAC and GST rate come from GET /purchase-service-catalog. */
  readonly serviceSac: Locator;
  readonly serviceGstRate: Locator;
  readonly saveButton: Locator;
  readonly validationSummary: Locator;
  readonly lockedBanner: Locator;
  readonly submitError: Locator;

  // View
  readonly confirmButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;
  readonly statusBadge: Locator;
  readonly actionError: Locator;
  readonly goToInvoiceButton: Locator;

  // Confirm modal
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder('Search by PO number or supplier…');
    this.newOrderLink = page.getByRole('link', { name: 'New Order' });
    this.scanBillButton = page.getByTestId('scan-bill-btn');
    this.scanBillInput = page.getByTestId('scan-bill-input');
    this.billsToMapLink = page.getByTestId('bills-to-map-link');
    this.sourceFilter = page.getByTestId('po-source-filter');

    this.supplierInput = page.getByRole('combobox', { name: 'Search supplier…' });
    this.poDate = page.locator('#poDate');
    this.dueDate = page.locator('#dueDate');
    this.brokerName = page.getByPlaceholder('Agent (if any)');
    this.transporter = page.getByPlaceholder('Lorry operator');
    this.vehicleNo = page.getByPlaceholder('TN01AB1234');
    this.ewayBill = page.getByPlaceholder('12-digit number');
    this.supplierInvoice = page.getByPlaceholder("Supplier's invoice number");
    this.addItemButton = page.getByRole('button', { name: /Add Item/ });
    this.serviceSac = page.locator('input[formcontrolname="sacCode"]');
    this.serviceGstRate = page.locator('select[formcontrolname="gstRate"]');
    this.saveButton = page.getByRole('button', { name: /Save Purchase Order/ });
    this.validationSummary = page.getByRole('alert').filter({ hasText: 'Please fix the following' });
    this.lockedBanner = page.getByRole('alert').filter({ hasText: 'This order cannot be edited' });
    this.submitError = page.getByRole('alert').filter({ has: page.locator('.bi-exclamation-triangle-fill') });

    this.confirmButton = page.getByRole('button', { name: /^\W*Confirm$/ });
    this.editButton = page.getByRole('button', { name: /^\W*Edit$/ });
    this.cancelButton = page.getByRole('button', { name: /^\W*Cancel$/ });
    this.statusBadge = page.locator('.badge.fs-6');
    this.actionError = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Close' }) });
    this.goToInvoiceButton = page.getByRole('button', { name: /Go to Invoice/ });

    this.confirmDialog = page.getByRole('dialog').filter({ hasText: 'Confirm Purchase Order' });
  }

  async gotoList(): Promise<void> {
    await this.goto('/purchase-orders');
    await expect(this.search).toBeVisible();
  }

  async gotoNew(): Promise<void> {
    await this.goto('/purchase-orders/new');
    await expect(this.supplierInput).toBeVisible();
  }

  async gotoView(id: string): Promise<void> {
    await this.goto(`/purchase-orders/${id}`);
    await expect(this.statusBadge).toBeVisible();
  }

  async gotoEdit(id: string): Promise<void> {
    await this.goto(`/purchase-orders/${id}/edit`);
    await expect(this.supplierInput).toBeVisible();
  }

  /** Switches the status tab and waits for the list reload. */
  async selectTab(tab: PurchaseOrderTab): Promise<void> {
    await this.afterResponse('GET', '/purchase-orders', () => this.page.getByRole('button', { name: tab, exact: true }).click());
  }

  /** Finds a PO by number through the search box (list reloads from the API). */
  async searchFor(text: string): Promise<void> {
    await this.afterResponse('GET', /\/purchase-orders\?.*search=/, () => this.search.fill(text));
  }

  rowFor(poNumber: string): Locator {
    return this.rowContaining(poNumber);
  }

  /** Types into the supplier typeahead and picks the result whose name matches. */
  async pickSupplier(name: string): Promise<void> {
    await this.supplierInput.fill(name);
    await this.page.getByRole('option', { name: new RegExp(escapeRe(name)) }).first().click();
  }

  /** Product search cell of the given (0-based) line. */
  productInput(line = 0): Locator {
    return this.page.getByPlaceholder('Search product…').nth(line);
  }

  async pickProduct(name: string, line = 0): Promise<void> {
    await this.productInput(line).fill(name);
    await this.page.getByRole('button', { name: new RegExp(`^${escapeRe(name)}`) }).first().click();
  }

  quantity(line = 0): Locator {
    return this.page.locator('input[formcontrolname="billedQuantity"]').nth(line);
  }

  rate(line = 0): Locator {
    return this.page.locator('input[formcontrolname="purchaseRate"]').nth(line);
  }

  /** Saves and resolves with the created/updated order id taken from the redirect URL. */
  async saveAndGetId(): Promise<string> {
    await this.saveButton.click();
    await expect(this.page).toHaveURL(/\/purchase-orders\/[0-9a-f-]{36}$/);
    return this.page.url().split('/').pop() as string;
  }

  /** Opens the confirm modal and accepts it; resolves with the confirm response. */
  async confirmFromView(): Promise<void> {
    await this.confirmButton.click();
    await expect(this.confirmDialog).toBeVisible();
    await this.afterResponse('POST', /\/purchase-orders\/[^/]+\/confirm/, () =>
      this.confirmDialog.getByRole('button', { name: 'Confirm Order' }).click(),
    );
  }
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
