import { test, expect } from '../../fixtures';
import { PurchaseOrderPage } from '../../pages/purchase-order.page';
import type { ApiClient } from '../../support/api-client';
import { isoDate, isTamilNadu } from '../../support/data';

interface Supplier {
  id: string;
  name: string;
  gstin?: string;
  stateCode?: string;
}

interface Product {
  id: string;
  name: string;
  hsnSacCode?: string;
  purchaseRate: number;
  gstRatePercentage: number;
}

async function masterData(
  api: ApiClient,
): Promise<{ supplier: Supplier; product: Product }> {
  const suppliers = await api.get<{ suppliers: Supplier[] }>('/supplier', {
    page: 1,
    pageSize: 50,
  });
  const supplier = suppliers.suppliers.find(
    (s) => isTamilNadu(s.stateCode) && /^[A-Za-z0-9 ]+$/.test(s.name),
  );
  expect(supplier, 'a TN supplier exists').toBeTruthy();

  const products = await api.get<{ products: Product[] }>('/product/list', {
    page: 1,
    pageSize: 20,
    isActive: true,
  });
  const product = products.products.find(
    (p) => p.purchaseRate > 0 && /^[A-Za-z0-9 ]+$/.test(p.name),
  );
  expect(product, 'an active product exists').toBeTruthy();

  return { supplier: supplier!, product: product! };
}

test.describe('AI purchase bill capture UI', () => {
  let po: PurchaseOrderPage;
  let data: { supplier: Supplier; product: Product };

  test.beforeEach(async ({ page, api }) => {
    po = new PurchaseOrderPage(page);
    data = await masterData(api);
  });

  test('scans a bill needing mapping, maps supplier and product in Bills to Map, and displays AI review details and confirm warning checkboxes', async ({
    page,
    uid,
  }) => {
    const billNo = uid('AIBILL');
    const rate = Number(data.product.purchaseRate || 100);
    const gstRate = Number(data.product.gstRatePercentage || 5);
    const qty = 2;
    const taxable = qty * rate;
    const halfGst = Number(((taxable * gstRate) / 200).toFixed(2));
    const printedGrandTotal = Math.round(taxable + halfGst * 2) + 40; // ₹40 difference to trigger GRAND_TOTAL_MISMATCH warning

    const mockExtraction = {
      isBill: true,
      billCount: 1,
      header: {
        supplierName: 'Unmapped Bill Supplier',
        supplierGstin: '33AAAAA0000A1Z0',
        supplierInvoiceNumber: billNo,
        invoiceDate: isoDate(),
      },
      lines: [
        {
          description: 'Unmapped Supplier Line Item',
          hsn: '99990000',
          quantity: qty,
          rate,
          discount: 0,
          taxableValue: taxable,
          gstRate,
          cgstAmount: halfGst,
          sgstAmount: halfGst,
          igstAmount: 0,
        },
      ],
      footer: {
        otherCharges: 0,
        roundOff: 0,
        grandTotal: printedGrandTotal,
      },
      fieldConfidence: {
        'header.supplierInvoiceNumber': 'LOW',
        'lines[0].rate': 'LOW',
      },
    };

    const pdfContent = `%PDF-1.4\n1 0 obj << /Type /Page >>\n%UID:${billNo}\n%MOCK_JSON:${JSON.stringify(
      mockExtraction,
    )}`;

    await po.gotoList();
    await expect(po.scanBillButton).toBeVisible();
    await expect(po.billsToMapLink).toBeVisible();
    await expect(po.sourceFilter).toBeVisible();

    await po.scanBillInput.setInputFiles({
      name: `${billNo}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfContent, 'utf8'),
    });

    await expect(page).toHaveURL(/\/purchase-orders\/bill-captures/);
    await expect(page.getByTestId('capture-mapping-panel')).toBeVisible();
    await expect(page.getByTestId('capture-file-preview')).toBeVisible();

    // Map supplier and line 0 product
    await page
      .getByTestId('map-supplier-select')
      .selectOption(data.supplier.id);
    await page
      .getByTestId('map-line-product-0')
      .selectOption(data.product.id);

    await page.getByTestId('resolve-capture-submit-btn').click();

    // Redirects to the created AI Draft PO view
    await expect(page).toHaveURL(/\/purchase-orders\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('ai-po-badge')).toBeVisible();
    await expect(page.getByTestId('ai-capture-warnings')).toBeVisible();
    await expect(page.getByTestId('ai-bill-preview')).toBeVisible();
    await expect(page.getByTestId('ai-printed-vs-computed')).toBeVisible();
    await expect(page.getByTestId('low-confidence-field').first()).toBeVisible();

    // Open confirm modal: warning checkboxes must be checked before Confirm Order is enabled
    await po.confirmButton.click();
    await expect(po.confirmDialog).toBeVisible();
    await expect(page.getByTestId('confirm-warnings-section')).toBeVisible();
    const confirmSubmitBtn = page.getByTestId('confirm-order-submit-btn');
    await expect(confirmSubmitBtn).toBeDisabled();

    const checkboxes = page.getByTestId('confirm-warning-checkbox');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }
    await expect(confirmSubmitBtn).toBeEnabled();
    await po.confirmDialog.getByRole('button', { name: 'Cancel' }).click();

    // Verify AI badge and source filter on PO list
    await po.gotoList();
    await po.sourceFilter.selectOption('AI_CAPTURE');
    await expect(page.getByTestId('ai-po-badge').first()).toBeVisible();
  });
});
