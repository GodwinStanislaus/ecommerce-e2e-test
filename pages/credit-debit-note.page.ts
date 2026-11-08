import { expect, type Locator, type Page } from '@playwright/test';

import { AppPage } from './app.page';

/** Credit/debit notes: list, create-credit form, sales/purchase debit forms, view. */
export class CreditDebitNotePage extends AppPage {
  // list
  readonly search: Locator;
  readonly newCreditNote: Locator;
  readonly moreNoteTypes: Locator;

  // credit note form
  readonly invoiceSearch: Locator;
  readonly reason: Locator;
  readonly description: Locator;
  readonly createNote: Locator;
  readonly cancelForm: Locator;

  // debit note form
  readonly internalNotes: Locator;
  readonly addCharge: Locator;
  readonly saveDebitNote: Locator;

  // view
  readonly approve: Locator;
  readonly cancelNote: Locator;
  readonly confirmCancel: Locator;
  readonly edit: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByRole('textbox', { name: 'Search by note # or party name...' });
    this.newCreditNote = page.getByRole('button', { name: 'New Credit Note' });
    this.moreNoteTypes = page.getByRole('button', { name: 'More note types' });

    this.invoiceSearch = page.getByRole('textbox', { name: 'Invoice # or customer name…' });
    this.reason = page.locator('main select').first();
    this.description = page.getByRole('textbox', { name: 'Provide details about this note…' });
    this.createNote = page.getByRole('button', { name: 'Create Note' });
    this.cancelForm = page.getByRole('button', { name: 'Cancel', exact: true });

    this.internalNotes = page.getByRole('textbox', { name: 'Internal Notes *' });
    this.addCharge = page.getByRole('button', { name: 'Add Charge' }).or(page.getByRole('button', { name: 'Add First Charge' })).first();
    this.saveDebitNote = page.getByRole('button', { name: 'Save Debit Note' });

    this.approve = page.getByRole('button', { name: 'Approve' });
    this.cancelNote = page.getByRole('button', { name: 'Cancel Note' }).first();
    this.confirmCancel = page.getByRole('button', { name: 'Yes, Cancel Note' });
    this.edit = page.getByRole('button', { name: 'Edit' });
  }

  async gotoList(): Promise<void> {
    await this.goto('/credit-debit-notes');
    await expect(this.search).toBeVisible();
  }

  async gotoCreate(): Promise<void> {
    await this.goto('/credit-debit-notes/create');
    await expect(this.invoiceSearch).toBeVisible();
  }

  async gotoView(id: string): Promise<void> {
    await this.goto(`/credit-debit-notes/${id}/view`);
  }

  rowByNote(noteNumber: string): Locator {
    return this.rowContaining(noteNumber);
  }

  /** Picks an invoice from the typeahead by its (unique) invoice number. */
  async pickInvoice(invoiceNumber: string): Promise<void> {
    await this.invoiceSearch.fill(invoiceNumber);
    await this.page.getByRole('button', { name: new RegExp(`^${invoiceNumber}\\s`) }).first().click();
  }

  /** Closes an open typeahead dropdown by clicking its full-screen click-catcher (it has no role or label). */
  async dismissDropdown(): Promise<void> {
    await this.page.locator('div.position-fixed.top-0.start-0.w-100.h-100').click({ position: { x: 5, y: 5 } });
  }

  returnType(name: 'Goods Return' | 'Price Correction' | 'Weight Shortage'): Locator {
    return this.page.getByRole('button', { name: new RegExp(name) });
  }
}

/** Reads the figure after a label in a block of text, e.g. grandTotalFrom("Grand Total ₹48.00 Audit"). */
export function amountAfter(label: string, text: string): number {
  const m = new RegExp(`${label}\\s*₹?\\s*(-?[\\d,]+(?:\\.\\d+)?)`).exec(text);
  return m ? Number((m[1] ?? '0').replace(/,/g, '')) : Number.NaN;
}
