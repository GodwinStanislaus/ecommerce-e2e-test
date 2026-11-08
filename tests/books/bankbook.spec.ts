import { BankbookPage } from '../../pages/bankbook.page';

import { defineBookListTests } from './book-list.shared';

defineBookListTests('bank', (page) => new BankbookPage(page));
