import { test, expect } from '../../fixtures';
import { AppPage } from '../../pages/app.page';

/**
 * The freight SAC code lives on the business profile (empty = system default 996511).
 * These tests keep the effective SAC unchanged while they run (null -> '996511' -> null),
 * so invoices created by parallel specs keep the same SAC.
 */
test.describe('Business profile: freight SAC code', () => {
  test('is editable, validated, saved to the profile and shown on the view', async ({ page, api }) => {
    const profile = await api.get('/business-profile/active');
    const original: string | null = profile.freightSacCode ?? null;
    // Only run where the effective SAC stays 996511 throughout (null or already 996511)
    test.skip(original !== null && original !== '996511', `profile freight SAC is ${original}; not changing it`);
    const app = new AppPage(page);

    try {
      await app.goto(`/business-profile/${profile.id}/edit`);
      const field = page.getByLabel('Freight SAC code');
      await expect(field).toBeVisible();

      // Malformed codes are rejected and nothing is sent
      let patched = false;
      page.on('request', (r) => {
        if (r.method() === 'PATCH' && r.url().includes('/business-profile/')) {
          patched = true;
        }
      });
      await field.fill('99');
      await page.getByRole('button', { name: /save|update/i }).first().click();
      await expect(page.getByText('Enter a 4, 6 or 8 digit SAC code.')).toBeVisible();
      expect(patched).toBe(false);

      // The effective default, set explicitly: persisted and shown on the view page
      await field.fill('996511');
      await app.afterResponse('PATCH', `/business-profile/${profile.id}`, () =>
        page.getByRole('button', { name: /save|update/i }).first().click(),
      );
      expect((await api.get('/business-profile/active')).freightSacCode).toBe('996511');
      await app.goto(`/business-profile/${profile.id}`);
      await expect(page.getByText('996511').first()).toBeVisible();

      // Clearing it returns to the system default (null in the profile, still 996511 effective)
      await app.goto(`/business-profile/${profile.id}/edit`);
      await page.getByLabel('Freight SAC code').fill('');
      await app.afterResponse('PATCH', `/business-profile/${profile.id}`, () =>
        page.getByRole('button', { name: /save|update/i }).first().click(),
      );
      expect((await api.get('/business-profile/active')).freightSacCode ?? null).toBeNull();
      const catalog = await api.get('/purchase-service-catalog');
      expect(catalog.services.find((s: any) => s.code === 'FREIGHT').sacCode).toBe('996511');
    } finally {
      // Restore whatever the profile had before the test
      await api.patch(`/business-profile/${profile.id}`, { freightSacCode: original });
    }
  });
});
