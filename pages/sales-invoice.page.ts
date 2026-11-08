import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/** Sales invoice list (/invoices) and view (/invoices/:id). Invoices are created from sales orders, not here. */
export class SalesInvoicePage extends AppPage {
  readonly heading: Locator;
  readonly search: Locator;
  readonly dateFrom: Locator;
  readonly dateTo: Locator;
  readonly statusFilter: Locator;
  readonly paymentFilter: Locator;
  readonly deliveryFilter: Locator;
  readonly clearFilters: Locator;
  readonly receiptButton: Locator;
  readonly emptyState: Locator;

  // view screen
  readonly printButton: Locator;
  readonly cancelButton: Locator;
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByText('Sales Invoices').first();
    this.search = page.getByPlaceholder('Search invoices...');
    this.dateFrom = page.getByRole('textbox', { name: 'Date from' });
    this.dateTo = page.getByRole('textbox', { name: 'Date to' });
    this.statusFilter = page.getByRole('combobox', { name: 'Filter by status' });
    this.paymentFilter = page.getByRole('combobox', { name: 'Filter by payment' });
    this.deliveryFilter = page.getByRole('combobox', { name: 'Filter by delivery' });
    this.clearFilters = page.getByRole('button', { name: /Clear$/ });
    this.receiptButton = page.getByRole('button', { name: 'Receipt' });
    this.emptyState = page.getByText('No invoices found');
    this.printButton = page.getByRole('button', { name: 'Print' });
    this.cancelButton = page.getByRole('button', { name: /Cancel$/ });
    this.confirmDialog = page.getByRole('dialog');
  }

  async gotoList(): Promise<void> {
    await this.goto('/invoices');
    await expect(this.search).toBeVisible();
  }

  async gotoView(id: string): Promise<void> {
    await this.goto(`/invoices/${id}`);
  }

  /** Row whose "Invoice" cell is exactly this number (substring match would hit 2 in 12, 20 ...). */
  row(invoiceNumber: string): Locator {
    return this.tableRows().filter({
      has: this.page.getByRole('cell', { name: invoiceNumber, exact: true }),
    });
  }

  /** Searches by invoice number and waits for the list API round-trip. */
  async searchFor(term: string): Promise<void> {
    await this.afterResponse('GET', '/sales-invoice/list', () => this.search.fill(term));
  }

  /** The icon-only "View details" button in a row (it has no accessible name, so use its title). */
  viewButton(row: Locator): Locator {
    return row.getByTitle('View details');
  }

  /** Document header of the view screen, e.g. "INVOICE #12". */
  viewHeader(invoiceNumber: string): Locator {
    return this.page.getByText(`INVOICE #${invoiceNumber}`);
  }

  totalsRow(label: string): Locator {
    return this.page.getByRole('row', { name: new RegExp(`^${label}\\b`) });
  }
}
