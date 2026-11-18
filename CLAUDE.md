# CLAUDE.md

Playwright end-to-end tests for `../ecommerce-bolt` (Angular admin UI), which talks to `../ecommerce-api`. Not a git repository.

## Commands

```bash
./scripts/with-env.sh npx playwright test tests/books   # run with login env (see Auth)
npm run test:auth | test:sales | test:purchase | test:payments | test:receipts | test:expenses | test:books
npm run check                                           # tsc + bans `.catch(() => {})` and waitForTimeout
npx playwright test -g "name" --project=chromium
npx playwright show-report
```

- Pick the target with `E2E_ENV=local|test|staging|...` (default `local`), e.g. `E2E_ENV=test ./scripts/with-env.sh npx playwright test tests/books`. Shortcuts: `npm run test:local | test:test | test:staging`.
- `local` starts/reuses the UI (`npm start` in `../ecommerce-bolt`, :4200); the API must already run on :3000. Other envs must already be deployed; no server is started.
- `E2E_ENV` starting with `prod` is refused unless `E2E_ALLOW_PROD=1` (the tests create real data and never clean up).
- Default is chromium only; `E2E_ALL_BROWSERS=1` adds firefox + webkit.

## Environments and auth

Config per environment lives in gitignored `.env.<name>` (template: `.env.example`): `E2E_BASE_URL`, `E2E_API_URL`, `E2E_MOBILE`, `E2E_PASSWORD`, optional `E2E_BUSINESS`. Precedence: shell > `.env.<E2E_ENV>` > `.env`. `scripts/with-env.sh` additionally falls back to `../api-test/.env` for `local` only. Never hard-code or print credentials.

`tests/setup/auth.setup.ts` signs in once through the real login screen (handles the business picker) and saves cookies to `.auth/<env>/user.json` plus the app's sessionStorage user to `.auth/<env>/session.json` (Playwright's storageState cannot carry sessionStorage; the `context` fixture in `fixtures/index.ts` restores it). Reused while the access token (15 min) has 12+ min left, so a full run never outlives it; `E2E_FORCE_LOGIN=1` forces a new login. `auth/*.spec.ts` run logged out (`*-anon` projects); all other specs start logged in, so import `test` from `fixtures`.

## Layout

- `tests/accounting/year-end-closing.spec.ts` — year-end close. Irreversible, and each run locks the lowest unused fiscal year from 2000, so the closing scenarios skip unless `E2E_YEAR_END=1` (admin login, never prod). The route check always runs.
- `tests/<area>/*.spec.ts` — `sales` (incl. `freight-gst`), `purchase` (incl. `service-catalog`), `payments`, `receipts`, `expenses`, `books` (cashbook + bankbook), `invoices`, `reports`, `auth`, `business-profile` (freight SAC code).
- `fixtures/index.ts` — import `test, expect` from here. Provides `app` (AppPage), `api` (authenticated REST client), `uid`, and an auto `guard` that fails any test that sees a page error or an API 5xx.
- `pages/` — page objects (`AppPage` base, `LoginPage`, one per module). Locators are built in the constructor, role/label first.
- `support/` — `env.ts`, `api-client.ts`, `data.ts` (`uid`, `isoDate`, `money`, `parseMoney`).
- `_legacy/` — superseded first-pass specs; every area is rewritten, safe to delete.
- Tests that document a known UI/API bug use `test.fail(true, 'BUG: ...')`; remove the marker when the bug is fixed (the test will then start failing as a reminder).

## Writing tests

- Arrange via `api` (fast), act and assert through the UI, then confirm persistence via `api` or the list screen.
- Wait on `app.afterResponse(method, urlPart, action)` or web-first `expect`; never timeouts, never swallowed errors.
- Create unique data with `uid()`. The dev DB is shared and other runs happen in parallel, so assert on your own records and on deltas, never on absolute totals.

## Rules

- Prefer role/label/test-id locators over CSS. Add `data-testid` in `../ecommerce-bolt` only when the user agrees.
- No fixed `waitForTimeout`; wait on locators or responses.
- Tests must not depend on order; create their own data with `uid()`.
- UI behaviour and form patterns are defined in `../ecommerce-bolt/CLAUDE.md`. When a test fails, find out whether the UI or the test is wrong before changing the test.
