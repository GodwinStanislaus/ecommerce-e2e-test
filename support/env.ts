import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const name = process.env['E2E_ENV'] ?? 'local';

// Precedence: shell > .env.<E2E_ENV> > .env (loadEnvFile never overrides what is already set).
for (const file of [`.env.${name}`, '.env']) {
  const path = resolve(root, file);
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

if (/^prod/i.test(name) && process.env['E2E_ALLOW_PROD'] !== '1') {
  throw new Error('Refusing to run against production: these tests create real data. Set E2E_ALLOW_PROD=1 only if you mean it.');
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in (or export it in the shell).`);
  }
  return value;
}

export const env = {
  /** local | test | staging | ... — picks `.env.<name>` and a separate saved session. */
  name,
  baseUrl: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
  apiUrl: process.env['E2E_API_URL'] ?? 'http://localhost:3000',
  business: process.env['E2E_BUSINESS'] ?? '',
  allBrowsers: process.env['E2E_ALL_BROWSERS'] === '1',
  /** Read lazily so specs that never log in don't need credentials. */
  get mobile(): string {
    return required('E2E_MOBILE');
  },
  get password(): string {
    return required('E2E_PASSWORD');
  },
};

// One saved session per environment so logins never leak between them.
export const AUTH_FILE = resolve(root, '.auth', name, 'user.json');

/** The app keeps the signed-in user in sessionStorage, which Playwright's storageState does not save. */
export const SESSION_FILE = resolve(root, '.auth', name, 'session.json');
