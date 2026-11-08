import { CashbookPage } from '../../pages/cashbook.page';

import { defineBookListTests } from './book-list.shared';

defineBookListTests('cash', (page) => new CashbookPage(page));
