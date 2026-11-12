import { expect } from '@playwright/test';

import type { ApiClient } from './api-client';

export interface FiscalYear {
  id: number;
  label: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
  isLocked: boolean;
}

export interface Period {
  id: number;
  periodName: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
}

export const fyLabel = (startYear: number): string => `FY${startYear}-${String(startYear + 1).slice(2)}`;

export async function listFiscalYears(api: ApiClient): Promise<FiscalYear[]> {
  return api.get<FiscalYear[]>('/financial-periods/fiscal-years');
}

export async function listPeriods(api: ApiClient, fiscalYearId: number): Promise<Period[]> {
  return api.get<Period[]>('/financial-periods', { fiscalYearId });
}

/**
 * Creates the lowest unused fiscal year (2000 and up), with its 12 periods.
 * A closed year can never be reopened, so each run uses a year no real
 * ledger touches and cannot disturb the business's current years.
 */
export async function createFreeFiscalYear(api: ApiClient): Promise<{ fy: FiscalYear; startYear: number }> {
  const taken = new Set((await listFiscalYears(api)).map((f) => f.label));
  let startYear = 2000;
  while (taken.has(fyLabel(startYear))) {
    startYear += 1;
  }
  expect(startYear, 'no free fiscal year left in 2000-2100').toBeLessThanOrEqual(2100);

  const fy = await api.post<FiscalYear>('/financial-periods/fiscal-year', { year: startYear });
  return { fy, startYear };
}

export async function closePeriods(api: ApiClient, fiscalYearId: number, except?: number): Promise<Period[]> {
  const periods = await listPeriods(api, fiscalYearId);
  for (const period of periods) {
    if (period.id !== except) {
      await api.patch(`/financial-periods/${period.id}/close`);
    }
  }
  return periods;
}

interface Account {
  accountId: number;
  glCode: string;
  accountName: string;
  accountRole?: string;
  isGroup: boolean;
}

export interface JournalAccounts {
  revenue: Account;
  expense: Account;
  cash: Account;
}

/** Seed-chart accounts a manual journal may use: Sales (4100), Miscellaneous Expenses (5101), a cash account. */
export async function journalAccounts(api: ApiClient): Promise<JournalAccounts | null> {
  const all = await api.get<Account[]>('/account-master');
  const revenue = all.find((a) => a.glCode === '4100' && !a.isGroup);
  const expense = all.find((a) => a.glCode === '5101' && !a.isGroup);
  const cash = all.find((a) => a.accountRole === 'CASH' && !a.isGroup);
  return revenue && expense && cash ? { revenue, expense, cash } : null;
}

/** Posts a two-line manual journal on `date` (needs an admin: it is back-dated). */
export async function postJournal(
  api: ApiClient,
  opts: { date: string; debitAccountId: number; creditAccountId: number; amount: number; narration: string },
): Promise<void> {
  const created = await api.post<{ id: string }>('/journal', {
    entryDate: `${opts.date}T10:00:00+05:30`,
    narration: opts.narration,
    lines: [
      { accountId: opts.debitAccountId, debitAmount: opts.amount, creditAmount: 0 },
      { accountId: opts.creditAccountId, debitAmount: 0, creditAmount: opts.amount },
    ],
  });
  await api.post(`/journal/${created.id}/post`);
}
