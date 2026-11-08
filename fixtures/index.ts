import { readFileSync } from 'node:fs';

import { test as base, expect } from '@playwright/test';

import { AppPage } from '../pages/app.page';
import { ApiClient } from '../support/api-client';
import { uid } from '../support/data';
import { SESSION_FILE } from '../support/env';
import { createSupplier } from '../tests/expenses/helpers';

type Fixtures = {
  app: AppPage;
  /** Authenticated API client for arranging/asserting data. */
  api: ApiClient;
  /** Unique reference generator: `uid('SO')`. */
  uid: typeof uid;
  /** Fails the test if the app logs uncaught errors or an API call returns 5xx. */
  guard: void;
};

type WorkerFixtures = {
  /**
   * One GST-registered supplier per worker, reused by every test in it.
   * Tests tell their records apart by bill number, not by supplier, so
   * they do not each need a supplier of their own.
   */
  sharedSupplier: { id: string; name: string };
};

export const test = base.extend<Fixtures, WorkerFixtures>({
  sharedSupplier: [
    async ({}, use, workerInfo) => {
      const api = await ApiClient.create();
      const created = await createSupplier(api, uid(`E2E Shared Sup W${workerInfo.workerIndex}`));
      await api.dispose();
      await use(created);
    },
    { scope: 'worker' },
  ],

  // Restore the app's sessionStorage user (storageState cannot carry it) so pages start signed in.
  context: async ({ context }, use) => {
    const { user } = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as { user: string };
    await context.addInitScript((value) => {
      if (!sessionStorage.getItem('user')) {
        sessionStorage.setItem('user', value);
      }
    }, user);
    await use(context);
  },

  app: async ({ page }, use) => {
    await use(new AppPage(page));
  },

  api: async ({}, use) => {
    const client = await ApiClient.create();
    await use(client);
    await client.dispose();
  },

  uid: async ({}, use) => {
    await use(uid);
  },

  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
      page.on('response', (res) => {
        if (res.status() >= 500) {
          problems.push(`${res.status()} ${res.request().method()} ${res.url()}`);
        }
      });
      await use();
      expect(problems, 'uncaught page errors or 5xx responses').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
