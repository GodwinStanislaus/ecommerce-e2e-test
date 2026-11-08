import { expect, type Locator, type Page } from '@playwright/test';

import { parseMoney } from '../support/data';
import { AppPage } from './app.page';

export interface LineInput {
  /** Expense head name (typed into the searchable select). */
  head?: string;
  description?: string;
  sac?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  /** GST percent: 0, 5, 12, 18 or 28. */
  gst?: number;
  printedGst?: number;
  /** false switches the ITC toggle off. */
  itc?: boolean;
}

export interface BillInput {
  supplier?: string;
  pay?: 'Pay later' | 'Bank' | 'Cash';
  paidFrom?: string;
  entryDate?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  serviceFrom?: string;
  serviceTo?: string;
  printedTotal?: number;
  remarks?: string;
  attachment?: string;
  lines?: LineInput[];
}

/** Expenses = supplier bills: list (/expenses), form (/expenses/new) and read-only view (/expenses/:id). */
export class ExpensePage extends AppPage {
  // ── list ──
  readonly listHeading: Locator;
  readonly newBill: Locator;
  readonly from: Locator;
  readonly to: Locator;
  readonly type: Locator;
  readonly payment: Locator;
  readonly refresh: Locator;
  readonly quickFilter: Locator;
  readonly billCount: Locator;
  readonly emptyState: Locator;

  // ── form ──
  readonly formTitle: Locator;
  readonly supplier: Locator;
  readonly entryDate: Locator;
  readonly paidFrom: Locator;
  readonly invoiceNo: Locator;
  readonly invoiceDate: Locator;
  readonly serviceToggle: Locator;
  readonly serviceFrom: Locator;
  readonly serviceTo: Locator;
  readonly printedTotal: Locator;
  readonly remarks: Locator;
  readonly attachment: Locator;
  readonly addLine: Locator;
  readonly save: Locator;
  readonly saveAndAdd: Locator;
  readonly cancel: Locator;
  readonly problems: Locator;

  constructor(page: Page) {
    super(page);
    this.listHeading = page.getByText('Supplier bills', { exact: true });
    this.newBill = page.getByRole('button', { name: 'New bill' }).first();
    this.from = this.filterControl('From', 'input');
    this.to = this.filterControl('To', 'input');
    this.type = this.filterControl('Type', 'select');
    this.payment = this.filterControl('Payment', 'select');
    this.refresh = page.getByRole('button', { name: 'Refresh' });
    this.quickFilter = page.locator('app-table-quick-filter').getByRole('textbox');
    this.billCount = page.locator('.card-header .badge').filter({ hasText: /\d+ bills/ });
    this.emptyState = page.getByText('No supplier bills for the selected period.');

    this.formTitle = page.getByRole('heading', { name: 'New supplier bill' });
    this.supplier = page.getByLabel('Supplier');
    this.entryDate = page.getByLabel('Entry date');
    this.paidFrom = page.getByLabel('Paid from');
    this.invoiceNo = page.getByLabel('Invoice no.');
    this.invoiceDate = page.getByLabel('Invoice date');
    this.serviceToggle = page.getByRole('button', { name: /service period/ });
    this.serviceFrom = page.getByLabel('Service period from');
    this.serviceTo = page.getByLabel('Service period to');
    this.printedTotal = page.getByLabel('Printed bill total');
    this.remarks = page.getByLabel('Remarks');
    this.attachment = page.getByLabel('Bill image / PDF link');
    this.addLine = page.getByRole('button', { name: 'Add line' });
    this.save = page.getByRole('button', { name: 'Save bill' });
    this.saveAndAdd = page.getByRole('button', { name: /Save & add another/ });
    this.cancel = page.getByRole('button', { name: 'Cancel' });
    this.problems = page.getByRole('alert').filter({ hasText: 'Please fix:' });
  }

  /** The list filters' <label>s are not linked to their controls (UI a11y gap), so find the control in the label's column. */
  private filterControl(label: string, control: 'input' | 'select'): Locator {
    return this.page
      .locator('.card-body .col-6')
      .filter({ has: this.page.locator('label', { hasText: new RegExp(`^${label}$`) }) })
      .locator(control);
  }

  // ── navigation ──
  async gotoList(): Promise<void> {
    await this.goto('/expenses');
    await expect(this.listHeading).toBeVisible();
    await expect(this.billCount).toBeVisible();
  }

  async gotoNew(): Promise<void> {
    await this.goto('/expenses/new');
    await expect(this.formTitle).toBeVisible();
    await expect(this.supplier).toBeVisible();
  }

  async gotoView(id: string): Promise<void> {
    await this.goto(`/expenses/${id}`);
    await expect(this.viewTitle).toBeVisible();
  }

  get viewTitle(): Locator {
    return this.page.getByRole('heading', { name: /^Supplier bill/ });
  }

  // ── list helpers ──
  /** Shows only bills entered on `date` (yyyy-mm-dd), so a crowded shared DB cannot push test rows off page 1. */
  async showDay(date: string): Promise<void> {
    await this.afterResponse('GET', `to=${date}`, async () => {
      await this.from.fill(date);
      await this.to.fill(date);
    });
    await expect(this.billCount).toBeVisible();
  }

  /** Narrows the table to rows containing `text` (client-side quick filter). */
  async search(text: string): Promise<void> {
    await this.quickFilter.fill(text);
  }

  /** Cell texts of the row for a bill: [billNo, billDate, supplier, head, taxable, gst, roundOff, payable, mode, voucher]. */
  async rowCells(text: string | RegExp): Promise<string[]> {
    const row = this.rowContaining(text);
    await expect(row).toHaveCount(1);
    return (await row.locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  }

  /** The direct / indirect totals shown by the summary panel (needs the panel open). */
  summaryCard(title: 'Direct Expenses' | 'Indirect Expenses'): Locator {
    return this.page.locator('.card').filter({ has: this.page.getByText(title, { exact: true }) });
  }

  async openSummary(): Promise<void> {
    await this.page.locator('button:has(i.bi-bar-chart-fill)').click();
    await expect(this.summaryCard('Direct Expenses')).toBeVisible();
  }

  // ── form helpers ──
  async pickSupplier(name: string): Promise<void> {
    await this.supplier.fill(name);
    await this.page.getByRole('option').filter({ hasText: name }).first().click();
    await expect(this.supplier).toHaveValue(name);
  }

  line(n: number) {
    const label = `Line ${n}`;
    return {
      head: this.page.getByRole('combobox', { name: `${label} expense head` }),
      description: this.page.getByLabel(`${label} description`),
      sac: this.page.getByLabel(`${label} SAC`),
      qty: this.page.getByLabel(`${label} quantity`),
      unit: this.page.getByLabel(`${label} unit`),
      rate: this.page.getByLabel(`${label} rate before GST`),
      gst: this.page.getByLabel(`${label} GST percent`),
      printedGst: this.page.getByLabel(`${label} printed GST`),
      itc: this.page.getByLabel(`${label} eligible for input tax credit`),
      duplicate: this.page.getByRole('button', { name: `Duplicate line ${n}` }),
      remove: this.page.getByRole('button', { name: `Remove line ${n}` }),
      row: this.page.locator('table.eb-lines tbody tr').nth(n - 1),
    };
  }

  async chooseHead(n: number, head: string): Promise<void> {
    const l = this.line(n);
    const option = this.page.getByRole('option').filter({ has: this.page.getByText(head, { exact: true }) }).first();
    // The list is positioned after opening and closes on blur/scroll, so retry the open+type+pick as one unit.
    await expect(async () => {
      await l.head.click();
      await l.head.fill(head);
      await option.click({ timeout: 2000 });
      await expect(l.head).toHaveValue(head, { timeout: 1000 });
    }).toPass({ timeout: 15000 });
  }

  async fillLine(n: number, input: LineInput): Promise<void> {
    const l = this.line(n);
    if (input.head !== undefined) await this.chooseHead(n, input.head);
    if (input.description !== undefined) await l.description.fill(input.description);
    if (input.sac !== undefined) await l.sac.fill(input.sac);
    if (input.qty !== undefined) await l.qty.fill(String(input.qty));
    if (input.unit !== undefined) await l.unit.fill(input.unit);
    if (input.rate !== undefined) await l.rate.fill(String(input.rate));
    if (input.gst !== undefined) await l.gst.selectOption({ label: `${input.gst}%` });
    if (input.printedGst !== undefined) await l.printedGst.fill(String(input.printedGst));
    if (input.itc === false) await l.itc.uncheck();
  }

  /** Fills the whole form from `input`; adds lines as needed. Does not save. */
  async fillBill(input: BillInput): Promise<void> {
    if (input.supplier) await this.pickSupplier(input.supplier);
    if (input.pay) {
      await this.payButton(input.pay).click();
    }
    if (input.paidFrom) await this.paidFrom.selectOption({ label: input.paidFrom });
    if (input.entryDate) await this.entryDate.fill(input.entryDate);
    if (input.invoiceNo !== undefined) await this.invoiceNo.fill(input.invoiceNo);
    if (input.invoiceDate !== undefined) await this.invoiceDate.fill(input.invoiceDate);
    if (input.serviceFrom !== undefined || input.serviceTo !== undefined) {
      await this.serviceToggle.click();
      if (input.serviceFrom) await this.serviceFrom.fill(input.serviceFrom);
      if (input.serviceTo) await this.serviceTo.fill(input.serviceTo);
    }
    const lines = input.lines ?? [];
    for (const [i, line] of lines.entries()) {
      if (i > 0) await this.addLine.click();
      await this.fillLine(i + 1, line);
    }
    if (input.printedTotal !== undefined) await this.printedTotal.fill(String(input.printedTotal));
    if (input.remarks !== undefined) await this.remarks.fill(input.remarks);
    if (input.attachment !== undefined) await this.attachment.fill(input.attachment);
  }

  /** Clicks Save bill and resolves with the POST /expense-entries response. */
  async submit() {
    return this.afterResponse('POST', '/expense-entries', () => this.save.click());
  }

  /** Pay later / Bank / Cash toggle (button names carry an icon glyph, so match by suffix within the group). */
  payButton(choice: 'Pay later' | 'Bank' | 'Cash'): Locator {
    return this.page.getByRole('group', { name: 'Payment' }).getByRole('button', { name: new RegExp(`${choice}$`) });
  }

  // ── totals panel (form and view share the markup) ──
  totalsRow(label: string | RegExp): Locator {
    return this.page.locator('.eb-dl > div').filter({ has: this.page.locator('dt', { hasText: label }) }).locator('dd');
  }

  async totalsAmount(label: string | RegExp): Promise<number> {
    return parseMoney(await this.totalsRow(label).first().innerText());
  }

  get payable(): Locator {
    return this.page.locator('.eb-payable dd');
  }

  /** Label value pairs of the read-only bill view, e.g. field('Supplier'). */
  viewField(label: string): Locator {
    return this.page.locator('.eb-field').filter({ has: this.page.locator('.eb-label', { hasText: new RegExp(`^${escapeRe(label)}$`) }) }).locator('span').last();
  }
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
