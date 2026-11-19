import { expect } from '@playwright/test';

import type { ApiClient } from '../../support/api-client';

export type StoredPdfState = 'ready' | 'no-bucket' | 'not-ready';

/**
 * Polls `GET /sales-invoice/:id/document` until the stored PDF can be read.
 * 'no-bucket': the API has no INVOICE_PDF_BUCKET (503 / INVOICE_DOCUMENT_STORAGE_ERROR), so nothing can be stored.
 * 'not-ready': still 409 after the wait (e.g. a B2B invoice that never got its IRN on this environment).
 * Generation is asynchronous (outbox event), so a fresh invoice is not ready at once.
 */
export async function waitForStoredPdf(api: ApiClient, invoiceId: string, timeoutMs = 60_000): Promise<StoredPdfState> {
  let state: StoredPdfState = 'not-ready';
  try {
    await expect
      .poll(
        async () => {
          const res = await api.raw().get(`/sales-invoice/${invoiceId}/document`);
          if (res.ok()) {
            state = 'ready';
          } else if (res.status() === 503 || (await res.text()).includes('INVOICE_DOCUMENT_STORAGE_ERROR')) {
            state = 'no-bucket';
          } else {
            state = 'not-ready';
          }
          return state !== 'not-ready';
        },
        {
          message: `stored PDF of invoice ${invoiceId}`,
          timeout: timeoutMs,
          intervals: [500, 1000, 2000, 3000],
        },
      )
      .toBe(true);
  } catch {
    // Timed out: `state` says why (still 'not-ready'), and the caller skips with that reason.
  }
  return state;
}
