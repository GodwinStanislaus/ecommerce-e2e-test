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

- UI (`npm start` in `../ecommerce-bolt`, :4200) is started/reused by `playwright.config.ts`. The API must already run on :3000.
- Default is chromium only; `E2E_ALL_BROWSERS=1` adds firefox + webkit.

## Auth

`tests/setup/auth.setup.ts` signs in once through the real login screen (handles the business picker) and saves cookies + localStorage to `.auth/user.json` (reused for 15 min; `E2E_FORCE_LOGIN=1` forces). Credentials come from `E2E_MOBILE`, `E2E_PASSWORD` (optional `E2E_BUSINESS`) in shell or gitignored `.env` (see `.env.example`); `scripts/with-env.sh` falls back to `../api-test/.env`. Never hard-code or print them. `auth/*.spec.ts` run logged out (`*-anon` projects); all other specs start logged in.

## Layout

- `tests/<area>/*.spec.ts` — `sales`, `purchase`, `payments`, `receipts`, `expenses`, `books` (cashbook + bankbook), `invoices`, `reports`, `auth`.
- `fixtures/index.ts` — import `test, expect` from here. Provides `app` (AppPage), `api` (authenticated REST client), `uid`, and an auto `guard` that fails any test that sees a page error or an API 5xx.
- `pages/` — page objects (`AppPage` base, `LoginPage`, one per module). Locators are built in the constructor, role/label first.
- `support/` — `env.ts`, `api-client.ts`, `data.ts` (`uid`, `isoDate`, `money`, `parseMoney`).
- `_legacy/` — old first-pass specs kept for reference only; delete each once its area is rewritten.

## Writing tests

- Arrange via `api` (fast), act and assert through the UI, then confirm persistence via `api` or the list screen.
- Wait on `app.afterResponse(method, urlPart, action)` or web-first `expect`; never timeouts, never swallowed errors.
- Create unique data with `uid()`. The dev DB is shared and other runs happen in parallel, so assert on your own records and on deltas, never on absolute totals.

## Rules

- Prefer role/label/test-id locators over CSS. Add `data-testid` in `../ecommerce-bolt` only when the user agrees.
- No fixed `waitForTimeout`; wait on locators or responses.
- Tests must not depend on order; create their own data with unique references (`Date.now()`).
- UI behaviour and form patterns are defined in `../ecommerce-bolt/CLAUDE.md`. When a test fails, find out whether the UI or the test is wrong before changing the test.
