import { type Page } from '@playwright/test';

import { BookListPage } from './cashbook.page';

export class BankbookPage extends BookListPage {
  constructor(page: Page) {
    super(page, '/bankbook', /Add Bank Book/, /No bank book entries found/, '/bank-book');
  }
}
