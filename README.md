# eCommerce Bolt - E2E Tests

End-to-end test suite for the eCommerce Bolt application using Playwright.

## Project Structure

```
ecommerce-bolt-e2e/
├── playwright.config.ts       # Playwright configuration
├── package.json              # Dependencies and scripts
├── tests/
│   ├── auth/                 # Authentication tests
│   │   └── login.spec.ts
│   ├── invoices/             # Invoice and order tests
│   │   ├── sales-order.spec.ts
│   │   ├── sales-invoice.spec.ts
│   │   ├── purchase-invoice.spec.ts
│   │   └── credit-debit-notes.spec.ts
│   ├── payments/             # Payment and receipt tests
│   │   ├── payment.spec.ts
│   │   └── receipt.spec.ts
│   └── reports/              # Report tests
│       └── reports.spec.ts
└── fixtures/
    ├── base-page.ts          # Base page object for common actions
    └── test-data.ts          # Test data and fixtures
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Ensure the Angular app is running on http://localhost:4200:
```bash
cd ../ecommerce-bolt
npm start
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in headed mode (visible browser)
```bash
npm run test:headed
```

### Run tests in debug mode
```bash
npm run test:debug
```

### Run tests in UI mode
```bash
npm run test:ui
```

### Run specific test suite
```bash
npm run test:auth                # Authentication tests
npm run test:invoices            # Invoice tests
npm run test:payments            # Payment tests
npm run test:reports             # Report tests
```

### Run specific test file
```bash
npx playwright test tests/auth/login.spec.ts
```

## Test Coverage

- **Auth Tests**: Login, logout, credential validation
- **Sales Order Tests**: Create, view, update, list sales orders
- **Sales Invoice Tests**: Create, view, generate PDF, mark paid
- **Purchase Invoice Tests**: Create, view, update, verify totals
- **Payment Tests**: Create, view, filter, update status
- **Receipt Tests**: Create, view, generate PDF, update status
- **Credit/Debit Notes Tests**: Create, view, verify totals, filter by type
- **Report Tests**: View, filter, export reports to CSV/Excel

## Test Data

Test data is configured in `fixtures/test-data.ts` and includes:
- Valid and invalid login credentials
- Customer and supplier information
- Product details
- Various transaction amounts

## Notes

- Tests use selectors that may need adjustment based on your actual UI
- Some selectors include fallback options (e.g., `'button:has-text("Save"), button:has-text("Create")'`)
- Tests handle cases where elements may not exist using `.catch(() => {})`
- Screenshots and traces are captured on test failures
- Multi-browser testing configured (Chromium, Firefox, WebKit)

## Debugging

1. **Run in headed mode**: `npm run test:headed`
2. **Run in debug mode**: `npm run test:debug` (opens Playwright Inspector)
3. **View traces**: Test traces are saved and can be viewed with Playwright Inspector
4. **Check screenshots**: Failed tests generate screenshots in `test-results/` folder

## CI/CD Integration

The `playwright.config.ts` is configured for CI/CD:
- Retries on failure (2 retries in CI)
- Single worker in CI (avoid concurrency issues)
- HTML report generation
- Screenshot/trace capture on failures

To run in CI mode:
```bash
CI=true npm test
```

## Customization

1. **Update Base URL**: Edit `baseURL` in `playwright.config.ts`
2. **Change credentials**: Update `testData.credentials` in `fixtures/test-data.ts`
3. **Add new tests**: Create new `.spec.ts` files following the existing pattern
4. **Update selectors**: Adjust selectors in tests to match your UI elements

## Troubleshooting

- **Tests fail to connect**: Ensure Angular app is running on http://localhost:4200
- **Element not found**: Adjust selectors in the test file
- **Timeout errors**: Increase timeout values in test or adjust `waitForLoadState()`
- **Authentication issues**: Verify credentials in `fixtures/test-data.ts`
