# eCommerce Bolt - E2E Tests

Playwright end-to-end tests for the admin UI (`../ecommerce-bolt`, Angular) and its API (`../ecommerce-api`, NestJS).

## Setup

```bash
npm install
npx playwright install chromium     # add firefox webkit for E2E_ALL_BROWSERS=1
cp .env.example .env.local          # then fill in the login (one file per environment)
```

`.env.<name>` values: `E2E_BASE_URL`, `E2E_API_URL`, `E2E_MOBILE`, `E2E_PASSWORD`, optional `E2E_BUSINESS` (used when the account belongs to several businesses). These files are gitignored. Never commit credentials.

For `local`, the UI is started (or reused) automatically on :4200; the API must already be running on :3000.

## Running

```bash
./scripts/with-env.sh npx playwright test                       # everything, local
./scripts/with-env.sh npx playwright test tests/books           # one area
./scripts/with-env.sh npx playwright test tests/sales/sales-order.spec.ts
./scripts/with-env.sh npx playwright test -g "cannot be confirmed"
npm run test:headed | test:debug | test:ui                      # interactive modes
npm run test:sales | test:purchase | test:payments | test:receipts | test:expenses | test:books | test:auth
npx playwright show-report                                      # HTML report of the last run
```

### Other environments

```bash
E2E_ENV=test    ./scripts/with-env.sh npx playwright test
E2E_ENV=staging ./scripts/with-env.sh npx playwright test tests/payments
```

`E2E_ENV` (default `local`) selects `.env.<name>` and a separate saved login in `.auth/<name>/`. Only `local` starts a dev server; other environments must already be deployed. `E2E_ENV=prod...` is refused unless `E2E_ALLOW_PROD=1`. The tests create vouchers, orders and expenses and do not clean them up, so use environments where that is acceptable. Cash and bank book tests need an admin or accounts role.

Shortcuts: `npm run test:local | test:test | test:staging`. Note these need credentials in `.env.<name>` or the shell (the `../api-test/.env` fallback is only in `with-env.sh`, for `local`).

## Coverage

| Area | Folder | What it covers |
|---|---|---|
| Auth | `tests/auth` | login form, validation, bad credentials, protected routes |
| Sales orders | `tests/sales` | create, confirm, blocked confirm |
| Purchase orders | `tests/purchase` | create, confirm, blocked confirm |
| Invoices, credit/debit notes | `tests/invoices` | sales/purchase invoices, notes |
| Purchase payments | `tests/payments` | list, create (cash/bank), allocation, view |
| Receipts | `tests/receipts` | list, create, allocation, view |
| Expenses | `tests/expenses` | list, create, validation |
| Cash book, bank book | `tests/books` | filters, balances, vouchers in the right book, export |
| Reports | `tests/reports` | filters, quick filter, export |

Tests marked `test.fail(true, 'BUG: ...')` document known UI/API bugs and pass while the bug exists. When a bug is fixed, the test starts failing: remove the marker.

## Layout

```
playwright.config.ts   projects: setup -> chromium (logged in), chromium-anon (auth specs)
tests/<area>/          specs; tests/setup/auth.setup.ts signs in once per run
fixtures/index.ts      `test` with app, api (REST client), uid and an auto guard (fails on page errors / API 5xx)
pages/                 page objects (role/label locators, built in the constructor)
support/               env.ts, api-client.ts, data.ts (uid, isoDate, parseMoney)
scripts/with-env.sh    runs a command with login env set
```

## Writing tests

- Import `test, expect` from `fixtures`.
- Arrange data through `api`, act and assert through the UI, confirm persistence via `api`.
- Wait on `app.afterResponse(...)` or web-first `expect`; no `waitForTimeout`, no `.catch(() => {})` (`npm run check` enforces this along with the type check).
- Create data with `uid()` and assert on your own records, never on absolute totals: the database is shared.

## Debugging

`npm run test:debug` (inspector), `npm run test:ui`, or open `playwright-report/index.html`. Failures keep screenshots and video in `test-results/`; traces are captured on the first retry (CI only retries).

## CI

`CI=true` enables 2 retries, one worker and `forbidOnly`.
