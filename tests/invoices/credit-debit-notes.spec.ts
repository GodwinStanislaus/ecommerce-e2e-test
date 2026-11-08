import { amountAfter, CreditDebitNotePage } from '../../pages/credit-debit-note.page';
import { parseMoney } from '../../support/data';
import { createSalesInvoice, pickCustomer, type ArrangedSalesInvoice } from '../_arrange';
import { expect, test } from '../../fixtures';
import type { ApiClient } from '../../support/api-client';

async function createCreditNote(api: ApiClient, inv: ArrangedSalesInvoice, description: string, qty = 1) {
  const detail = await api.get(`/sales-invoice/${inv.id}/for-note`);
  const item = detail.items[0];
  return api.post('/credit-debit-notes/credit', {
    noteType: 'CREDIT_NOTE',
    salesInvoiceId: inv.id,
    customerId: detail.customerId,
    noteDate: new Date().toISOString().slice(0, 10),
    reason: 'Customer Return',
    description,
    returnType: 'GOODS_RETURN',
    items: [
      {
        salesInvoiceItemId: item.id,
        productId: item.productId,
        originalQuantity: item.originalBilledQty,
        adjustedQuantity: qty,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent || 0,
        gstRate: item.gstRate,
        lineType: 'GOODS_RETURN',
      },
    ],
    notes: '',
    includeFreightInCredit: false,
  });
}

test.describe('Credit and debit notes', () => {
  let cdn: CreditDebitNotePage;

  test.beforeEach(({ page }) => {
    cdn = new CreditDebitNotePage(page);
  });

  test('list shows search, the new-note menu and table columns', async ({ page }) => {
    await cdn.gotoList();
    await expect(cdn.newCreditNote).toBeVisible();
    await expect(cdn.moreNoteTypes).toBeVisible();
    await cdn.moreNoteTypes.click();
    await expect(page.getByRole('menuitem', { name: /Sales Debit Note/ }).or(page.getByText('Sales Debit Note').first())).toBeVisible();
    await expect(page.getByText('Purchase Debit Note').first()).toBeVisible();
  });

  test('a credit note raised via the API is listed with type, invoice, customer and amount', async ({ api, uid }) => {
    const inv = await createSalesInvoice(api, 3);
    const note = await createCreditNote(api, inv, uid('cn'));

    await cdn.gotoList();
    await cdn.search.fill(note.noteNumber);
    const row = cdn.rowByNote(note.noteNumber);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Credit');
    await expect(row).toContainText(inv.customer.name);
    await expect(row).toContainText('DRAFT');
    expect(parseMoney(await row.getByRole('cell').nth(5).innerText())).toBe(Number(note.grandTotal));
  });

  test('view shows the note, its returned line and a summary that matches the API', async ({ api, uid, page }) => {
    const inv = await createSalesInvoice(api, 3);
    const note = await createCreditNote(api, inv, uid('cn'), 2);

    await cdn.gotoList();
    await cdn.search.fill(note.noteNumber);
    await cdn.page.getByRole('button', { name: `View ${note.noteNumber}` }).click();
    await expect(page).toHaveURL(new RegExp(`/credit-debit-notes/${note.id}/view$`));

    await expect(page.getByRole('heading', { name: note.noteNumber })).toBeVisible();
    await expect(page.getByText('Credit Note', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(inv.product.name) })).toBeVisible();
    expect(amountAfter('Grand Total', await page.locator('main').innerText())).toBe(Number(note.grandTotal));
    await expect(cdn.approve).toBeVisible();
    await expect(cdn.edit).toBeVisible();
    await expect(cdn.cancelNote).toBeVisible();
  });

  test('creates a goods-return credit note through the form', async ({ api, uid, page }) => {
    const inv = await createSalesInvoice(api, 3);
    const description = uid('return');

    await cdn.gotoCreate();
    await cdn.pickInvoice(inv.invoiceNumber);
    await cdn.reason.selectOption({ label: 'Customer Return' });
    await cdn.returnType('Goods Return').click();
    await cdn.description.fill(description);
    await page.getByRole('row', { name: new RegExp(inv.product.name) }).getByRole('checkbox').check();

    const res = await cdn.afterResponse('POST', '/credit-debit-notes/credit', () => cdn.createNote.click());
    expect(res.status()).toBe(201);
    const created = await res.json();

    await expect(page).not.toHaveURL(/\/create$/);
    const saved = await api.get(`/credit-debit-notes/${created.id}`);
    expect(saved.noteType).toBe('CREDIT_NOTE');
    expect(saved.description).toBe(description);
    expect(saved.salesInvoiceId).toBe(inv.id);
    expect(saved.status).toBe('DRAFT');
  });

  test('submitting an empty credit note form shows validation and does not post', async ({ page }) => {
    await cdn.gotoCreate();
    await page.keyboard.press('Escape'); // closes the invoice dropdown, whose full-screen overlay would block the button
    await cdn.createNote.click();
    await expect(page.getByText(/required/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/credit-debit-notes\/create$/);
  });

  test('approving a draft credit note persists the approval', async ({ api, uid }) => {
    const inv = await createSalesInvoice(api, 3);
    const note = await createCreditNote(api, inv, uid('cn'));
    await cdn.gotoView(note.id);
    await cdn.afterResponse('PATCH', `/credit-debit-notes/${note.id}/approve`, () => cdn.approve.click());
    await expect(cdn.approve).toHaveCount(0);
    const saved = await api.get(`/credit-debit-notes/${note.id}`);
    expect(saved.status).not.toBe('DRAFT');
  });

  test('cancelling a draft credit note persists the cancellation', async ({ api, uid }) => {
    const inv = await createSalesInvoice(api, 3);
    const note = await createCreditNote(api, inv, uid('cn'));
    await cdn.gotoView(note.id);
    await cdn.cancelNote.click();
    await cdn.afterResponse('PATCH', `/credit-debit-notes/${note.id}/cancel`, () => cdn.confirmCancel.click());
    const saved = await api.get(`/credit-debit-notes/${note.id}`);
    expect(saved.status).toBe('CANCELLED');
  });

  test('sales debit note form lists its reasons and validates before saving', async ({ page }) => {
    await page.goto('/credit-debit-notes/sales-debit/create');
    await expect(page.getByRole('heading', { name: 'New Debit Note' })).toBeVisible();
    await expect(cdn.page.getByRole('combobox', { name: 'Reason *' }).getByRole('option')).toHaveText([
      'Select reason…', 'Under-invoiced Amount', 'Additional Freight Charges', 'Loading / Unloading Charges', 'Penalty Charges', 'Other',
    ]);
    await cdn.saveDebitNote.click();
    await expect(page).toHaveURL(/sales-debit\/create$/);
  });

  test('creates a sales debit note for an extra charge through the form', async ({ api, uid, page }) => {
    test.fail(
      true,
      'UI BUG: debit-note-form.component.ts (line ~450/547) sends productId "" for a free-form charge line; the API rejects it (400 "items.0.productId must be a UUID"), so no sales debit note can be saved.',
    );
    const customer = await pickCustomer(api);
    const chargeName = uid('Extra freight');

    await page.goto('/credit-debit-notes/sales-debit/create');
    await page.getByPlaceholder('Search customer by name or GSTIN…').fill(customer.name);
    await page.getByRole('button', { name: new RegExp(customer.name.replace(/[()]/g, '\\$&')) }).first().click();
    await cdn.dismissDropdown(); // the optional invoice dropdown opens after choosing the customer
    await page.getByRole('combobox', { name: 'Reason *' }).selectOption({ label: 'Additional Freight Charges' });
    await cdn.internalNotes.fill(uid('debit'));
    await cdn.addCharge.click();
    await page.getByRole('textbox', { name: 'e.g. Extra Freight Charges' }).fill(chargeName);
    await page.getByRole('spinbutton').nth(1).fill('250');

    const res = await cdn.afterResponse('POST', '/credit-debit-notes/debit', () => cdn.saveDebitNote.click());
    expect(res.status(), await res.text()).toBe(201);
    const created = await res.json();
    const saved = await api.get(`/credit-debit-notes/${created.id}`);
    expect(saved.noteType).toBe('DEBIT_NOTE');
    expect(saved.customerId).toBe(customer.id);
    expect(Number(saved.totalTaxableValue)).toBe(250);
  });

  test('purchase debit note form lists its reasons', async ({ page }) => {
    await page.goto('/credit-debit-notes/purchase-debit/create');
    await expect(cdn.page.getByRole('combobox', { name: 'Reason *' }).getByRole('option')).toHaveText([
      'Select reason…', 'Purchase Return', 'Over-billed by Supplier', 'Damaged Goods', 'Rate Difference', 'Other',
    ]);
    await cdn.saveDebitNote.click();
    await expect(page).toHaveURL(/purchase-debit\/create$/);
  });
});
