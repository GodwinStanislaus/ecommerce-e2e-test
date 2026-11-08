import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from this project; shell variables always win.
const envFile = resolve(import.meta.dirname, '..', '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in (or export it in the shell).`);
  }
  return value;
}

export const env = {
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

export const AUTH_FILE = resolve(import.meta.dirname, '..', '.auth', 'user.json');

/** The app keeps the signed-in user in sessionStorage, which Playwright's storageState does not save. */
export const SESSION_FILE = resolve(import.meta.dirname, '..', '.auth', 'session.json');
