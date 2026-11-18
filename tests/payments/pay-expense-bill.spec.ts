import { expect, test } from '../../fixtures';
import { PurchasePaymentPage } from '../../pages/purchase-payment.page';
import { createSupplier, headUnder, seedBill } from '../expenses/helpers';

test.setTimeout(150_000);
// Payment numbers can collide under parallel runs (API answers 409); retry like the other payment specs.
test.describe.configure({ retries: 2 });

test.describe('Pay credit expense bills', () => {
  test('part payment leaves the bill part paid, the rest clears it', async ({ page, api, uid }) => {
    const supplier = await createSupplier(api, uid('E2E Bill Sup'));
    const head = await headUnder(api, 'indirect');
    const billNo = uid('EB');
    // 1000 + 18% GST = 1180
    const bill = await seedBill(api, { supplierId: supplier.id, billNo, lines: [{ accountId: head.accountId, rate: 1000, gstRate: 18 }] });
    // GL posting is asynchronous and the API refuses payments until the bill has reached the supplier ledger.
    await expect.poll(async () => ((await api.get(`/supplier-ledger/supplier/${supplier.id}/statement`)).items as unknown[]).length, { timeout: 90_000, intervals: [500, 1_000, 2_000] }).toBeGreaterThan(0);
    const pp = new PurchasePaymentPage(page);

    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    const row = pp.invoiceRow(billNo);
    await expect(row).toContainText('Expense');
    await pp.selectInvoice(billNo);
    await expect(pp.amount).toHaveValue('1180');

    await pp.fillPayment({ amount: 400, method: 'Cash' });
    const first = await pp.submitPayment();
    expect(first.status(), await first.text()).toBe(201);
    await expect(pp.toast(/recorded successfully/).first()).toBeVisible();

    const firstPayment = await api.get(`/payment/${(await first.json()).id}`);
    expect(firstPayment.allocations).toHaveLength(1);
    expect(firstPayment.allocations[0]).toMatchObject({ amountAllocated: 400 });

    let outstanding = await api.get<any[]>('/expense-entries/outstanding', { supplierId: supplier.id });
    expect(outstanding.find((b) => b.id === bill.id)).toMatchObject({ paid: 400, outstanding: 780 });
    const partial = await api.get('/expense-entries', { paymentStatus: 'partial', supplierId: supplier.id });
    expect(JSON.stringify(partial)).toContain(bill.id);

    // Second payment: the bill is offered again with the remaining amount and settles it.
    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await pp.selectInvoice(billNo);
    await expect(pp.amount).toHaveValue('780');
    await pp.fillPayment({ method: 'Cash' });
    expect((await pp.submitPayment()).status()).toBe(201);

    outstanding = await api.get<any[]>('/expense-entries/outstanding', { supplierId: supplier.id });
    expect(outstanding.find((b) => b.id === bill.id)).toBeUndefined();

    // A paid bill is no longer offered for payment.
    await pp.gotoNew();
    await pp.pickSupplier(supplier.name);
    await expect(pp.invoiceRow(billNo)).toHaveCount(0);
  });
});
