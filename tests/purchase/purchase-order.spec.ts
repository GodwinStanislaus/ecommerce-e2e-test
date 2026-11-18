import { test, expect } from '../../fixtures';
import { PurchaseOrderPage } from '../../pages/purchase-order.page';
import type { ApiClient } from '../../support/api-client';
import { isoDate, isTamilNadu } from '../../support/data';

interface Supplier {
  id: string;
  name: string;
  stateCode?: string;
}
interface Product {
  id: string;
  name: string;
  purchaseRate: number;
  gstRatePercentage: number;
}

/** Existing master data from the shared dev DB: a Tamil Nadu supplier (intra-state) and an active product. */
async function masterData(api: ApiClient): Promise<{ supplier: Supplier; product: Product }> {
  const suppliers = await api.get<{ suppliers: Supplier[] }>('/supplier', { page: 1, pageSize: 50 });
  const supplier = suppliers.suppliers.find((s) => isTamilNadu(s.stateCode) && /^[A-Za-z0-9 ]+$/.test(s.name));
  expect(supplier, 'a TN supplier with a plain alphanumeric name exists').toBeTruthy();
  const products = await api.get<{ products: Product[] }>('/product/list', { page: 1, pageSize: 20, isActive: true });
  const product = products.products.find((p) => p.purchaseRate > 0 && /^[A-Za-z0-9 ]+$/.test(p.name));
  expect(product, 'an active product with a plain alphanumeric name exists').toBeTruthy();
  return { supplier: supplier!, product: product! };
}

async function createDraft(
  api: ApiClient,
  data: { supplier: Supplier; product: Product },
  extra: Record<string, unknown> = {},
): Promise<{ id: string; purchaseOrderNumber: string }> {
  return api.post('/purchase-orders', {
    supplierId: data.supplier.id,
    orderDate: isoDate(),
    orderItems: [
      {
        productId: data.product.id,
        quantity: 2,
        unitPriceAgreed: data.product.purchaseRate,
        gstRate: data.product.gstRatePercentage,
      },
    ],
    ...extra,
  });
}

test.describe('Purchase orders', () => {
  let po: PurchaseOrderPage;
  let data: { supplier: Supplier; product: Product };

  test.beforeEach(async ({ page, api }) => {
    po = new PurchaseOrderPage(page);
    data = await masterData(api);
  });

  test('creates a draft through the form and lists it under Draft', async ({ api, uid }) => {
    const invoiceNo = uid('PO');
    await po.gotoNew();
    await po.pickSupplier(data.supplier.name);
    await po.pickProduct(data.product.name);
    await po.quantity().fill('3');
    await po.supplierInvoice.fill(invoiceNo);

    const id = await po.saveAndGetId();

    const saved = await api.get(`/purchase-orders/${id}`);
    expect(saved.status).toBe('Draft');
    expect(saved.supplierId).toBe(data.supplier.id);
    expect(saved.supplierInvoiceNumber).toBe(invoiceNo);
    expect(saved.orderItems).toHaveLength(1);
    expect(saved.orderItems[0].productId).toBe(data.product.id);
    expect(Number(saved.orderItems[0].quantity)).toBe(3);

    // Lands on the view page, showing a draft.
    await expect(po.statusBadge).toHaveText('Draft');
    await expect(po.page.getByText(saved.purchaseOrderNumber).first()).toBeVisible();

    await po.gotoList();
    await po.searchFor(saved.purchaseOrderNumber);
    const row = po.rowFor(saved.purchaseOrderNumber);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(data.supplier.name);
    await expect(row).toContainText('Draft');
    await expect(row.getByRole('link').first()).toBeVisible();
  });

  test('confirms a draft: status, persistence and controls follow the UI rules', async ({ api, uid }) => {
    const draft = await createDraft(api, data, { supplierInvoiceNumber: uid('PI') });
    await po.gotoView(draft.id);

    // Draft offers Edit / Confirm / Cancel and no invoice link yet.
    await expect(po.statusBadge).toHaveText('Draft');
    await expect(po.editButton).toBeVisible();
    await expect(po.confirmButton).toBeEnabled();
    await expect(po.cancelButton).toBeVisible();
    await expect(po.goToInvoiceButton).toHaveCount(0);

    // The modal names the order and can be dismissed without effect.
    await po.confirmButton.click();
    await expect(po.confirmDialog).toBeVisible();
    await expect(po.confirmDialog).toContainText(draft.purchaseOrderNumber);
    await po.confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(po.confirmDialog).toBeHidden();
    await expect(po.statusBadge).toHaveText('Draft');
    expect((await api.get(`/purchase-orders/${draft.id}`)).status).toBe('Draft');

    // Confirm for real.
    await po.confirmFromView();
    await expect(po.statusBadge).toHaveText('Confirmed');
    await expect(po.toast('Purchase order confirmed').first()).toBeVisible();
    await expect(po.editButton).toHaveCount(0);
    await expect(po.confirmButton).toHaveCount(0);
    await expect(po.cancelButton).toHaveCount(0);
    await expect(po.goToInvoiceButton).toBeVisible();

    const confirmed = await api.get(`/purchase-orders/${draft.id}`);
    expect(confirmed.status).toBe('Confirmed');
    expect(confirmed.linkedInvoiceId, 'confirming creates a purchase invoice').toBeTruthy();

    // List: gone from Draft, present under Confirmed.
    await po.gotoList();
    await po.searchFor(draft.purchaseOrderNumber);
    await expect(po.rowFor(draft.purchaseOrderNumber)).toHaveCount(0);
    await po.selectTab('Confirmed');
    const row = po.rowFor(draft.purchaseOrderNumber);
    await expect(row).toContainText('Confirmed');
    await expect(row.getByRole('link', { name: /^$/ }).filter({ has: po.page.locator('.bi-pencil') })).toHaveCount(0);
  });

  test('confirm without a supplier invoice number is rejected and the order stays draft', async ({ api }) => {
    const draft = await createDraft(api, data);
    await po.gotoView(draft.id);

    await po.confirmButton.click();
    const response = await po.afterResponse('POST', /\/purchase-orders\/[^/]+\/confirm/, () =>
      po.confirmDialog.getByRole('button', { name: 'Confirm Order' }).click(),
    );
    expect(response.status()).toBe(400);

    await expect(po.actionError).toContainText('Supplier Invoice Number is required');
    await expect(po.statusBadge).toHaveText('Draft');
    await expect(po.confirmButton).toBeEnabled();
    expect((await api.get(`/purchase-orders/${draft.id}`)).status).toBe('Draft');
  });

  test('a confirmed order cannot be confirmed again or edited', async ({ api, uid }) => {
    const draft = await createDraft(api, data, { supplierInvoiceNumber: uid('PI') });
    await api.post(`/purchase-orders/${draft.id}/confirm`);

    // API refuses a second confirm.
    const again = await api.raw().post(`/purchase-orders/${draft.id}/confirm`);
    expect(again.status()).toBe(409);

    // UI: no confirm/edit on the view page.
    await po.gotoView(draft.id);
    await expect(po.statusBadge).toHaveText('Confirmed');
    await expect(po.confirmButton).toHaveCount(0);
    await expect(po.editButton).toHaveCount(0);

    // Edit route still opens, but shows the lock banner and disables the order fields.
    await po.gotoEdit(draft.id);
    await expect(po.lockedBanner).toBeVisible();
    await expect(po.supplierInvoice).toBeDisabled();
    await expect(po.brokerName).toBeDisabled();
    await expect(po.addItemButton).toHaveCount(0);
    await expect(po.dueDate).toBeEnabled();
  });

  test('a cancelled order has no confirm control and the API refuses to confirm it', async ({ api, uid }) => {
    const draft = await createDraft(api, data, { supplierInvoiceNumber: uid('PI') });
    await api.post(`/purchase-orders/${draft.id}/cancel`, { reason: 'e2e cancelled order' });

    await po.gotoView(draft.id);
    await expect(po.statusBadge).toHaveText('Cancelled');
    await expect(po.confirmButton).toHaveCount(0);
    await expect(po.editButton).toHaveCount(0);

    const res = await api.raw().post(`/purchase-orders/${draft.id}/confirm`);
    expect(res.status()).toBe(409);
    expect((await api.get(`/purchase-orders/${draft.id}`)).status).toBe('Cancelled');
  });

  test('cancelling a draft from the view needs a reason of 5+ characters', async ({ api }) => {
    const draft = await createDraft(api, data);
    await po.gotoView(draft.id);

    await po.cancelButton.click();
    const dialog = po.page.getByRole('dialog').filter({ hasText: 'Cancel Purchase Order' });
    await expect(dialog).toBeVisible();
    const submit = dialog.getByRole('button', { name: 'Cancel Order' });
    await expect(submit).toBeDisabled();
    await dialog.getByPlaceholder('Enter reason for cancellation…').fill('abc');
    await expect(submit).toBeDisabled();
    await dialog.getByPlaceholder('Enter reason for cancellation…').fill('e2e wrong supplier');
    await expect(submit).toBeEnabled();
    await po.afterResponse('POST', /\/cancel/, () => submit.click());

    await expect(po.statusBadge).toHaveText('Cancelled');
    expect((await api.get(`/purchase-orders/${draft.id}`)).status).toBe('Cancelled');
  });

  test.describe('form validation', () => {
    test('empty submit shows a summary and creates nothing', async () => {
      await po.gotoNew();
      let posted = false;
      po.page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().includes('/purchase-orders')) {
          posted = true;
        }
      });

      // Submit is never disabled for validation; it reports instead.
      await expect(po.saveButton).toBeEnabled();
      await po.saveButton.click();

      await expect(po.validationSummary).toBeVisible();
      await expect(po.validationSummary).toContainText('Supplier');
      await expect(po.page.getByText('Select a supplier from the list')).toBeVisible();
      await expect(po.page.getByText('Select a product')).toBeVisible();
      await expect(po.page).toHaveURL(/\/purchase-orders\/new$/);
      expect(posted).toBe(false);
    });

    test('rejects malformed transport, e-way bill and supplier invoice values', async () => {
      await po.gotoNew();
      await po.pickSupplier(data.supplier.name);
      await po.pickProduct(data.product.name);

      await po.vehicleNo.fill('NOTAVEHICLE');
      await po.ewayBill.fill('12345');
      await po.supplierInvoice.fill('0123');
      await po.saveButton.click();

      await expect(po.page.getByText('Invalid format (e.g. TN38AB1234)')).toBeVisible();
      await expect(po.page.getByText('Must be exactly 12 digits')).toBeVisible();
      await expect(po.page.getByText('Max 16 chars: letters, digits, / and -; cannot start with 0')).toBeVisible();
      await expect(po.validationSummary).toContainText('Vehicle No');
      await expect(po.validationSummary).toContainText('E-Way Bill');
      await expect(po.validationSummary).toContainText('Supplier Invoice #');
      await expect(po.page).toHaveURL(/\/purchase-orders\/new$/);
    });

    test('an e-way bill needs a vehicle number or transporter', async () => {
      await po.gotoNew();
      await po.pickSupplier(data.supplier.name);
      await po.pickProduct(data.product.name);
      await po.ewayBill.fill('123456789012');
      await po.saveButton.click();

      await expect(po.page.getByText('Enter vehicle no or transporter')).toBeVisible();
      await expect(po.validationSummary).toContainText('E-Way Bill needs Vehicle No or Transporter');

      await po.transporter.fill('E2E Lorry');
      await expect(po.page.getByText('Enter vehicle no or transporter')).toBeHidden();
    });

    test('due date cannot be before the PO date', async () => {
      await po.gotoNew();
      await po.pickSupplier(data.supplier.name);
      await po.pickProduct(data.product.name);
      await po.poDate.fill(isoDate(-1));
      await po.dueDate.fill(isoDate(-3));
      await po.saveButton.click();

      await expect(po.page.getByText('Cannot be before PO date')).toBeVisible();
      await expect(po.validationSummary).toContainText('Due Date is before PO Date');
    });

    test('PO date cannot be in the future', async () => {
      await po.gotoNew();
      await po.pickSupplier(data.supplier.name);
      await po.pickProduct(data.product.name);
      await po.poDate.fill(isoDate(5));
      await po.saveButton.click();

      await expect(po.validationSummary).toContainText('PO Date');
      await expect(po.page).toHaveURL(/\/purchase-orders\/new$/);
    });

    test('quantity must be positive', async () => {
      await po.gotoNew();
      await po.pickSupplier(data.supplier.name);
      await po.pickProduct(data.product.name);
      await po.quantity().fill('0');
      await po.saveButton.click();

      await expect(po.validationSummary).toContainText('Qty');
      await expect(po.page).toHaveURL(/\/purchase-orders\/new$/);
    });
  });
});
