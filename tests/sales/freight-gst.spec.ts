import { test, expect } from '../../fixtures';
import { pickCustomer, pickProduct } from '../_arrange';
import { SalesInvoicePage } from '../../pages/sales-invoice.page';
import { SalesOrderPage } from '../../pages/sales-order.page';
import type { ApiClient } from '../../support/api-client';
import { isoDate, isTamilNadu } from '../../support/data';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The freight SAC the API serves for freight: the business profile's, or the system default. */
async function freightSacFromApi(api: ApiClient): Promise<string> {
  const catalog = await api.get<{ services: { code: string; sacCode: string }[] }>('/purchase-service-catalog');
  const freight = catalog.services.find((s) => s.code === 'FREIGHT');
  expect(freight, 'FREIGHT is in the purchase service catalog').toBeTruthy();
  return freight!.sacCode;
}

test.describe('Sales freight GST', () => {
  test('manual freight is taxed at the product GST rate with equal halves, not at the rate sent', async ({ api, uid }) => {
    const customer = await pickCustomer(api);
    const products = await api.get('/product/list', { page: 1, limit: 50 });
    const product = products.products.find(
      (p: any) => p.isActive && (p.inventory?.stockQuantity ?? 0) > 100 && Number(p.saleRate) > 0,
    );
    expect(product, 'dev DB needs an in-stock product').toBeTruthy();

    // The GST fields sent here are wrong on purpose: the API recomputes them.
    const order = await api.post('/order', {
      customerId: customer.id,
      shippingAddressId: customer.shippingAddressId,
      orderItems: [{ productId: product.id, quantity: 1 }],
      freight: {
        taxableAmount: 100.17,
        gstAmount: 0,
        totalAmount: 100.17,
        appliedGstRate: 0,
        isManualOverride: true,
        isFreeFreight: false,
      },
      notes: uid('FREIGHT-GST'),
      deliveryDate: isoDate(1),
      orderType: 'REGULAR',
    });

    const saved = await api.get(`/order/${order.id}`);
    const rate = Number(product.gstRatePercentage);
    const freight = saved.freightSummary;
    expect(Number(freight.gstRate), 'freight is taxed at the product GST rate').toBe(rate);
    expect(Number(freight.taxableAmount)).toBe(100.17);

    const intraState = isTamilNadu(saved.shippingStateCode);
    const expectedGst = intraState
      ? round2((100.17 * rate) / 200) * 2 // equal CGST/SGST halves
      : round2((100.17 * rate) / 100); // single IGST amount
    expect(Number(freight.gstAmount)).toBeCloseTo(expectedGst, 2);
    expect(Number(freight.totalAmount)).toBeCloseTo(100.17 + expectedGst, 2);
  });

  test('the invoice keeps order and invoice freight equal, a whole-rupee total and the SAC the API serves', async ({
    page,
    api,
  }) => {
    const customer = await pickCustomer(api);
    const product = await pickProduct(api);
    const order = await api.post('/order', {
      customerId: customer.id,
      shippingAddressId: customer.shippingAddressId,
      orderItems: [{ productId: product.id, quantity: 2 }],
      freight: {
        taxableAmount: 10.17,
        gstAmount: 0,
        totalAmount: 10.17,
        isManualOverride: true,
        isFreeFreight: false,
      },
      deliveryDate: isoDate(1),
      orderType: 'REGULAR',
      notes: 'e2e freight gst invoice',
    });
    const orderTotals = (await api.get(`/order/${order.id}`)).freightSummary;
    const confirmed = await api.patch(`/order/${order.id}/confirm`, {});
    const invoiceId = (confirmed.salesInvoiceId ?? confirmed.invoiceId ?? confirmed.id) as string;
    const invoice = await api.get(`/sales-invoice/${invoiceId}`);

    // Order and invoice agree on freight GST and total to the paisa
    expect(Number(invoice.freightGstAmount)).toBeCloseTo(Number(orderTotals.gstAmount), 2);
    expect(Number(invoice.freightTotalAmount)).toBeCloseTo(Number(orderTotals.totalAmount), 2);
    // The grand total is a whole rupee and includes the round-off
    expect(Number(invoice.grandTotal)).toBe(Math.round(Number(invoice.grandTotal)));
    expect(Number(invoice.grandTotal)).toBeCloseTo(
      Number(invoice.subTotal) +
        Number(invoice.freightTaxableAmount) +
        Number(invoice.totalGstAmount) +
        Number(invoice.roundingOffAmount),
      2,
    );

    // The SAC is the API's, never a UI constant
    const sac = await freightSacFromApi(api);
    expect(invoice.freightSacCode).toBe(sac);
    await new SalesInvoicePage(page).gotoView(invoiceId);
    await expect(page.getByText(`SAC: ${sac}`).first()).toBeVisible();
  });

  test('manual freight GST % on the order form is read-only and follows the product GST rate', async ({ app, api }) => {
    // The freight card needs a customer with a business group and a shipping address (pincode or zone)
    const { customers } = await api.get('/customer/list', { page: 1, pageSize: 50 });
    const customer = customers.find(
      (c: any) =>
        c.isActive &&
        !c.isBlocked &&
        c.businessGroupId &&
        c.addresses.some((a: any) => a.addressType === 'shipping' && (a.pincode || a.zone)),
    );
    expect(customer, 'dev DB needs an active customer with a business group and a shipping address pincode').toBeTruthy();

    const inventory = await api.get('/inventory');
    const stock = inventory.find((i: any) => i.product.isActive && i.stockQuantity - i.reservedQuantity >= 100);
    expect(stock, 'dev DB needs a product with >= 100 free stock').toBeTruthy();
    const rate = Number(stock.product.gstRatePercentage);

    const so = new SalesOrderPage(app.page);
    await so.gotoNew();
    await so.selectCustomer(customer.name);
    await so.addProduct(stock.product.name, 1);

    await expect(so.freightOverrideButton).toBeVisible();
    await so.freightOverrideButton.click();
    await so.manualFreightInput.fill('100');

    // The GST % field cannot be edited; it carries the API-applied rate
    await expect(so.manualFreightGstRate).toHaveValue(String(rate));
    await expect(so.manualFreightGstRate).not.toBeEditable();
    await expect(so.freightCard).toContainText(`GST (${rate}%)`);
  });
});
