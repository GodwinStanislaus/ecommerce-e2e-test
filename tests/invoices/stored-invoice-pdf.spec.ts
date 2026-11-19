import { StoredInvoicePdfPage } from '../../pages/stored-invoice-pdf.page';
import { createSalesInvoice } from '../_arrange';
import { expect, test } from '../../fixtures';
import { waitForStoredPdf } from './stored-invoice-pdf';

// Stored invoice PDF flow (admin UI). It needs the API's invoice bucket (INVOICE_PDF_BUCKET) and
// environment.features.storedInvoicePdf=true in the UI build; without the bucket the PDF tests skip.
test.describe('Stored invoice PDF', () => {
  let pdf: StoredInvoicePdfPage;

  test.beforeEach(({ page }) => {
    pdf = new StoredInvoicePdfPage(page);
  });

  test.describe('Print v2', () => {
    test('opens the stored PDF of an issued invoice in a new tab', async ({ api, page }) => {
      test.setTimeout(120_000);
      // The signed-in user confirms the order, so they need a signature (see tests/users/signature.spec.ts).
      const inv = await createSalesInvoice(api);
      const state = await waitForStoredPdf(api, inv.id);
      test.skip(state === 'no-bucket', 'API has no INVOICE_PDF_BUCKET on this environment (stored PDFs unavailable)');
      test.skip(state === 'not-ready', 'Stored PDF still not ready after 60 s (B2B invoice waiting for its IRN?)');

      await pdf.gotoView(inv.id);
      await expect(pdf.viewHeader(inv.invoiceNumber)).toBeVisible();
      await expect(pdf.printV2Button).toBeVisible();

      const popup = page.waitForEvent('popup');
      const docResponse = await pdf.afterResponse('GET', `/sales-invoice/${inv.id}/document`, () => pdf.printV2Button.click());
      expect(docResponse.status()).toBe(200);
      expect(docResponse.headers()['content-type']).toContain('application/pdf');
      expect((await docResponse.body()).subarray(0, 5).toString()).toBe('%PDF-');

      // The tab is opened from the click and then pointed at the PDF blob.
      const tab = await popup;
      await expect.poll(() => tab.url(), { message: 'popup shows the PDF blob' }).toMatch(/^blob:/);
      await expect(pdf.printV2Button).toBeVisible();
      await expect(pdf.page.getByText('Preparing…')).toHaveCount(0);
    });

    test('is offered next to the regular Print button', async ({ api }) => {
      const inv = await createSalesInvoice(api);
      await pdf.gotoView(inv.id);
      await expect(pdf.viewHeader(inv.invoiceNumber)).toBeVisible();
      await expect(pdf.printButton).toBeVisible();
      await expect(pdf.printV2Button).toBeVisible();
    });
  });

  test.describe('missing PDF banner', () => {
    test('invoice list warns how many issued invoices have no stored PDF', async () => {
      const res = await pdf.afterResponse('GET', '/invoice-documents/missing', () => pdf.gotoList());
      expect(res.ok()).toBeTruthy();
      const { count, invoices } = (await res.json()) as { count: number; invoices: { invoiceId: string; invoiceNumber: string }[] };

      if (count === 0) {
        await expect(pdf.missingBanner).toHaveCount(0);
        test.info().annotations.push({ type: 'info', description: 'no invoice is missing its PDF here: banner correctly absent' });
        return;
      }

      const shown = invoices.length;
      await expect(pdf.missingBanner).toBeVisible();
      await expect(pdf.missingBanner).toContainText(
        new RegExp(`${shown} issued invoices? still (has|have) no stored PDF`),
      );

      // Show / Hide the list
      await expect(pdf.bannerToggle).toHaveText('Show');
      await expect(pdf.bannerToggle).toHaveAttribute('aria-expanded', 'false');
      await pdf.bannerToggle.click();
      await expect(pdf.bannerToggle).toHaveText('Hide');
      await expect(pdf.bannerInvoiceLinks()).toHaveCount(shown);
      await expect(pdf.bannerInvoiceLinks().first()).toHaveText(invoices[0]!.invoiceNumber);
      await pdf.bannerToggle.click();
      await expect(pdf.bannerInvoiceLinks()).toHaveCount(0);
    });

    test('choosing an invoice in the banner opens its view', async () => {
      const res = await pdf.afterResponse('GET', '/invoice-documents/missing', () => pdf.gotoList());
      const { invoices } = (await res.json()) as { invoices: { invoiceId: string; invoiceNumber: string }[] };
      test.skip(invoices.length === 0, 'No invoice is missing its PDF on this environment');

      await pdf.bannerToggle.click();
      await pdf.bannerInvoiceLinks().first().click();
      await expect(pdf.page).toHaveURL(new RegExp(`/invoices/${invoices[0]!.invoiceId}$`));
      await expect(pdf.viewHeader(invoices[0]!.invoiceNumber)).toBeVisible();
    });
  });
});
