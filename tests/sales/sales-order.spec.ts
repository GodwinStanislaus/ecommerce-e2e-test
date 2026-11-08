import { test, expect } from '../../fixtures';
import type { ApiClient } from '../../support/api-client';
import { SalesOrderPage } from '../../pages/sales-order.page';

interface Arranged {
  customer: { id: string; name: string; shippingAddressId: string };
  product: { id: string; name: string };
}

/** An active, unblocked customer with a shipping address, and an active product with plenty of free stock. */
async function arrangeMasterData(api: ApiClient): Promise<Arranged> {
  const { customers } = await api.get('/customer/list', { page: 1, pageSize: 50 });
  const customer = customers.find(
    (c: any) => c.isActive && !c.isBlocked && c.addresses.some((a: any) => a.addressType === 'shipping'),
  );
  expect(customer, 'dev DB needs an active customer with a shipping address').toBeTruthy();

  const inventory = await api.get('/inventory');
  const stock = inventory.find((i: any) => i.product.isActive && i.stockQuantity - i.reservedQuantity >= 100);
  expect(stock, 'dev DB needs a product with >= 100 free stock').toBeTruthy();

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      shippingAddressId: customer.addresses.find((a: any) => a.addressType === 'shipping').id,
    },
    product: { id: stock.productId, name: stock.product.name },
  };
}

async function createDraftViaApi(api: ApiClient, data: Arranged, notes: string) {
  return api.post('/order', {
    customerId: data.customer.id,
    shippingAddressId: data.customer.shippingAddressId,
    notes,
    orderItems: [{ productId: data.product.id, quantity: 1 }],
  });
}

test.describe('Sales order: create and confirm', () => {
  let so: SalesOrderPage;
  let data: Arranged;

  test.beforeEach(async ({ app, api }) => {
    so = new SalesOrderPage(app.page);
    data = await arrangeMasterData(api);
  });

  test('creates a draft order through the UI and lists it as PENDING', async ({ api, uid }) => {
    const note = uid('NOTE');
    await so.gotoNew();
    await so.selectCustomer(data.customer.name);
    await so.addProduct(data.product.name, 2);
    await so.page.getByPlaceholder(/special instructions/i).fill(note);

    const created = await so.saveNew();

    const persisted = await api.get(`/order/${created.id}`);
    expect(persisted.status).toBe('PENDING');
    expect(persisted.customerId).toBe(data.customer.id);
    expect(persisted.notes).toBe(note);
    expect(persisted.orderItems).toHaveLength(1);
    expect(Number(persisted.orderItems[0].quantity)).toBe(2);

    await so.gotoList();
    await so.listSearch.fill(created.orderNumber);
    const row = so.orderRow(created.orderNumber);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(data.customer.name);
    await expect(row).toContainText(/pending/i);
  });

  test('confirms a pending order from its detail page', async ({ api, uid }) => {
    const order = await createDraftViaApi(api, data, uid('CONFIRM'));

    await so.gotoOrder(order.id);
    await expect(so.statusBadge).toContainText('PENDING');
    await so.confirmFromView();

    // The UI returns to the list after a successful confirm.
    await expect(so.page).toHaveURL(/\/sales-orders$/);

    // Persisted: confirming converts the order into a finalized invoice.
    const after = await api.get(`/order/${order.id}`);
    expect(after.status).toBe('INVOICED');

    // Detail page now offers no confirm / edit actions.
    await so.gotoOrder(order.id);
    await expect(so.statusBadge).toContainText('INVOICED');
    await expect(so.confirmButton).toHaveCount(0);
    await expect(so.actionsMenu).toHaveCount(0);
  });

  test('declining the confirm dialog keeps the order PENDING', async ({ api, uid }) => {
    const order = await createDraftViaApi(api, data, uid('KEEP'));

    await so.gotoOrder(order.id);
    await so.confirmButton.click();
    const dialog = so.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /cancel|no/i }).first().click();
    await expect(dialog).toBeHidden();

    await expect(so.statusBadge).toContainText('PENDING');
    expect((await api.get(`/order/${order.id}`)).status).toBe('PENDING');
  });
});

test.describe('Sales order: only pending orders can be confirmed', () => {
  let so: SalesOrderPage;
  let data: Arranged;

  test.beforeEach(async ({ app, api }) => {
    so = new SalesOrderPage(app.page);
    data = await arrangeMasterData(api);
  });

  test('an already confirmed order has no confirm button and the API rejects a second confirm', async ({ api, uid }) => {
    const order = await createDraftViaApi(api, data, uid('TWICE'));
    await api.patch(`/order/${order.id}/confirm`, {});

    await so.gotoOrder(order.id);
    await expect(so.statusBadge).toContainText('INVOICED');
    await expect(so.confirmButton).toHaveCount(0);

    const again = await api.raw().patch(`/order/${order.id}/confirm`, { data: {} });
    expect(again.status()).toBe(400);
    expect((await again.json()).message).toMatch(/only orders with status pending/i);
  });

  test('a cancelled order has no confirm button and cannot be confirmed', async ({ api, uid }) => {
    const order = await createDraftViaApi(api, data, uid('CANCEL'));
    await api.patch(`/order/${order.id}/cancel`, { reason: 'e2e cancel' });

    await so.gotoOrder(order.id);
    await expect(so.statusBadge).toContainText('CANCELLED');
    await expect(so.confirmButton).toHaveCount(0);

    const res = await api.raw().patch(`/order/${order.id}/confirm`, { data: {} });
    expect(res.status()).toBe(400);
    expect((await api.get(`/order/${order.id}`)).status).toBe('CANCELLED');
  });

  test('a blocked order cannot be confirmed from the UI or the API', async ({ api, uid }) => {
    const order = await createDraftViaApi(api, data, uid('BLOCK'));
    await api.patch(`/order/${order.id}/block`, { reason: 'e2e block' });

    await so.gotoOrder(order.id);
    await expect(so.statusBadge).toContainText('BLOCKED');
    await expect(so.confirmButton).toHaveCount(0);

    const res = await api.raw().patch(`/order/${order.id}/confirm`, { data: {} });
    expect(res.status()).toBe(400);
  });
});

test.describe('Sales order: create form validation', () => {
  let so: SalesOrderPage;
  let data: Arranged;

  test.beforeEach(async ({ app, api }) => {
    so = new SalesOrderPage(app.page);
    data = await arrangeMasterData(api);
    await so.gotoNew();
  });

  test('saving with no customer asks for one and creates nothing', async ({ page }) => {
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/order$/.test(r.url())) posted = true;
    });

    await so.saveButton.click();
    await expect(so.validationAlert).toContainText('Select a customer first.');
    expect(posted).toBe(false);
  });

  test('saving a customer with no products asks for a product', async () => {
    await so.selectCustomer(data.customer.name);
    await so.saveButton.click();
    await expect(so.validationAlert).toContainText('Add at least one product.');
  });

  test('a zero quantity is rejected', async () => {
    await so.selectCustomer(data.customer.name);
    await so.addProduct(data.product.name, 0);
    await so.saveButton.click();
    await expect(so.validationAlert).toContainText('Quantity must be more than zero');
  });
});
