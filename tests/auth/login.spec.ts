import { expect, test } from '@playwright/test';

import { LoginPage } from '../../pages/login.page';
import { env } from '../../support/env';

test.describe('Login', () => {
  let login: LoginPage;

  test.beforeEach(async ({ page }) => {
    login = new LoginPage(page);
    await login.goto();
  });

  test('shows the sign-in form', async () => {
    await expect(login.mobile).toBeVisible();
    await expect(login.password).toBeVisible();
    await expect(login.submit).toBeEnabled();
  });

  test('requires mobile number and password', async ({ page }) => {
    await login.submit.click();
    await expect(page.getByText('Mobile number is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('rejects a malformed mobile number', async ({ page }) => {
    await login.fill('12345', 'whatever1');
    await login.submit.click();
    await expect(page.getByText('Enter a valid 10-digit mobile number')).toBeVisible();
  });

  test('rejects wrong credentials without leaving the page', async ({ page }) => {
    await login.fill('9000000000', 'definitely-wrong-pw');
    await login.submit.click();
    await expect(login.error).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('signs in with valid credentials', async ({ page }) => {
    await login.signIn(env.mobile, env.password, env.business);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('redirects protected routes to login when signed out', async ({ page }) => {
    await page.goto('/cashbook');
    await expect(page).toHaveURL(/\/login/);
  });
});
