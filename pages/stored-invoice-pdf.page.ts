import type { Locator, Page } from '@playwright/test';

import { SalesInvoicePage } from './sales-invoice.page';

/** Stored invoice PDF parts of the sales invoice screens: "Print v2" on the view, the missing-PDF banner on the list. */
export class StoredInvoicePdfPage extends SalesInvoicePage {
  readonly printV2Button: Locator;
  readonly missingBanner: Locator;
  readonly bannerToggle: Locator;

  constructor(page: Page) {
    super(page);
    // While the PDF is prepared the label turns into "Preparing…", so match only the idle one.
    this.printV2Button = page.getByRole('button', { name: /Print v2/ });
    this.missingBanner = page.getByRole('alert').filter({ hasText: 'no stored PDF' });
    this.bannerToggle = this.missingBanner.getByRole('button', { name: /^(Show|Hide)$/ });
  }

  /** Invoice-number links inside the expanded banner list. */
  bannerInvoiceLinks(): Locator {
    return this.missingBanner.getByRole('listitem').getByRole('button');
  }
}
