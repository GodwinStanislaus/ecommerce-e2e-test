import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { expect, test as setup } from '@playwright/test';

import { LoginPage } from '../../pages/login.page';
import { AUTH_FILE, env, SESSION_FILE } from '../../support/env';

/** The API's access token lives 15 min; a full run takes up to ~10, so only reuse a session with at least this much left. */
const MIN_TOKEN_LIFE_MS = 12 * 60 * 1000;

function sessionIsFresh(): boolean {
  try {
    statSync(SESSION_FILE);
    const state = JSON.parse(readFileSync(AUTH_FILE, 'utf8')) as { cookies: { name: string; expires: number }[] };
    const token = state.cookies.find((c) => c.name === 'access_token');
    return !!token && token.expires * 1000 - Date.now() > MIN_TOKEN_LIFE_MS;
  } catch {
    return false;
  }
}

setup('sign in and save session', async ({ page }) => {
  // Parallel runs (several people/sessions) share one saved session; reuse it while it is young.
  setup.skip(sessionIsFresh() && !process.env['E2E_FORCE_LOGIN'], 'saved session has enough token life left');

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
