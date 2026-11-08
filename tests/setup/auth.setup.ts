import { mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { expect, test as setup } from '@playwright/test';

import { LoginPage } from '../../pages/login.page';
import { AUTH_FILE, env, SESSION_FILE } from '../../support/env';

const MAX_AGE_MS = 15 * 60 * 1000;

function sessionIsFresh(): boolean {
  try {
    return [AUTH_FILE, SESSION_FILE].every((f) => Date.now() - statSync(f).mtimeMs < MAX_AGE_MS);
  } catch {
    return false;
  }
}

setup('sign in and save session', async ({ page }) => {
  // Parallel runs (several people/sessions) share one saved session; reuse it while it is young.
  setup.skip(sessionIsFresh() && !process.env['E2E_FORCE_LOGIN'], 'saved session is fresh');

  const login = new LoginPage(page);
  await login.goto();
  await login.signIn(env.mobile, env.password, env.business);
  await expect(page).not.toHaveURL(/\/login/);

  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  const tmp = `${AUTH_FILE}.${process.pid}.tmp`;
  await page.context().storageState({ path: tmp });
  const user = await page.evaluate(() => sessionStorage.getItem('user'));
  expect(user, 'app should store the user in sessionStorage after login').toBeTruthy();
  const sessionTmp = `${SESSION_FILE}.${process.pid}.tmp`;
  writeFileSync(sessionTmp, JSON.stringify({ user }));
  // Atomic renames, so readers never see half-written files. Session file first: AUTH_FILE's age gates reuse.
  renameSync(sessionTmp, SESSION_FILE);
  renameSync(tmp, AUTH_FILE);
});
