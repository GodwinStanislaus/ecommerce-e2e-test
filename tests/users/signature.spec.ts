import { UserPage } from '../../pages/user.page';
import { oversizedPng, TINY_PNG } from '../../support/image';
import { expect, test } from '../../fixtures';
import { listStaffUsers } from './signature';

// Staff signatures are a prerequisite of the stored invoice PDF: confirming an order fails with
// USER_SIGNATURE_MISSING for a user who has none. Uploads are idempotent (only users without one).
test.describe('Staff signatures', () => {
  let up: UserPage;

  test.beforeEach(({ page }) => {
    up = new UserPage(page);
  });

  test('every active staff user has a signature, uploaded through the user screen', async ({ api }) => {
    const missing = (await listStaffUsers(api)).filter((u) => !u.hasSignature);
    test.info().annotations.push({
      type: 'info',
      description: missing.length ? `uploading for: ${missing.map((u) => u.name).join(', ')}` : 'all staff users already had one',
    });

    for (const user of missing) {
      await up.gotoEdit(user.id);
      await expect(up.signaturePreview).toHaveCount(0);

      const res = await up.upload({ name: 'signature.png', mimeType: 'image/png', buffer: TINY_PNG }, user.id);
      expect(res.ok(), `upload for ${user.name}: ${res.status()}`).toBeTruthy();

      await expect(up.signaturePreview).toBeVisible();
      await expect(up.removeSignature).toBeVisible();
      await expect(up.signatureError).toHaveCount(0);
    }

    const after = await listStaffUsers(api);
    expect(after.filter((u) => !u.hasSignature).map((u) => u.name)).toEqual([]);

    await up.gotoList();
    for (const user of missing) {
      await expect(up.row(user.name)).toContainText('Uploaded');
    }
  });

  test('staff list shows a Signature column with an Uploaded or Missing badge per user', async ({ api }) => {
    const users = await listStaffUsers(api);
    await up.gotoList();
    for (const user of users) {
      await expect(up.row(user.name)).toContainText(user.hasSignature ? 'Uploaded' : 'Missing');
    }
  });

  test('a non-image file is rejected without calling the API', async ({ api }) => {
    const [user] = await listStaffUsers(api);
    if (!user) throw new Error('No active staff user');
    let uploads = 0;
    up.page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/signature')) uploads += 1;
    });

    await up.gotoEdit(user.id);
    await up.signatureFile.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });

    await expect(up.signatureError).toHaveText('Only PNG, JPEG or WebP images are allowed.');
    expect(uploads).toBe(0);
  });

  test('an image over 500 KB is rejected without calling the API', async ({ api }) => {
    const [user] = await listStaffUsers(api);
    if (!user) throw new Error('No active staff user');
    let uploads = 0;
    up.page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/signature')) uploads += 1;
    });

    await up.gotoEdit(user.id);
    await up.signatureFile.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: oversizedPng() });

    await expect(up.signatureError).toHaveText('Image must be 500 KB or smaller.');
    expect(uploads).toBe(0);
  });
});
