import { expect } from '@playwright/test';

import type { ApiClient } from '../../support/api-client';
import { isoDate } from '../../support/data';

export type Mode = 'cash' | 'bank';
export type Kind = 'receipt' | 'payment';

/** Accounts / counter ledgers on the dev DB (ids from /cash-book/ledgers and /bank-book/ledgers). */
export const ACCOUNTS = {
  cash: { id: 54, name: 'Petty Cash', path: '/cash-book', key: 'cashAccountId', route: '/cashbook' },
  bank: { id: 172, name: 'Bank - Indian Bank', path: '/bank-book', key: 'bankAccountId', route: '/bankbook' },
} as const;
export const COUNTER = {
  receipt: { id: 88, name: 'Interest Received' },
  payment: { id: 41, name: 'Freight Inbound' },
} as const;

export interface BookEntry {
  id: string;
  voucherNumber: string;
  mode: Mode;
  kind: Kind;
  amount: number;
  particulars: string;
  date: string;
  accountName: string;
  counterName: string;
}

interface Options {
  date?: string;
  approve?: boolean;
}

/**
 * Creates an entry through the API. Payments are first funded with an approved receipt on the same account
 * (the API rejects payments that would take the account negative).
 */
export async function createEntry(
  api: ApiClient,
  mode: Mode,
  kind: Kind,
  amount: number,
  particulars: string,
  { date = isoDate(0), approve = true }: Options = {},
): Promise<BookEntry> {
  const acc = ACCOUNTS[mode];
  const counter = COUNTER[kind];
  const type = kind === 'receipt' ? 'RECEIPT_VOUCHER_ENTRY' : 'PAYMENT_VOUCHER_ENTRY';
  const body = { type, [acc.key]: acc.id, toFromAccountId: counter.id, date, amount, particulars };

  if (kind === 'payment') {
    await fund(api, mode, amount + 1, date);
  }

  let created: any;
  await expect
    .poll(
      async () => {
        const res = await api.raw().post(acc.path, { data: body });
        if (res.ok()) {
          created = await res.json();
          return 'ok';
        }
        return `${res.status()} ${await res.text()}`;
      },
      { message: `create ${mode} ${kind}`, timeout: 15_000 },
    )
    .toBe('ok');

  let voucherNumber: string = created.voucherNumber;
  if (approve) {
    // The voucher number can change on approval, so read it from the approved voucher.
    const approved = await api.post(`${acc.path}/${created.voucherId}/approve`, {});
    voucherNumber = approved.voucherNumber;
  }
  return {
    id: created.voucherId,
    voucherNumber,
    mode,
    kind,
    amount,
    particulars,
    date,
    accountName: acc.name,
    counterName: counter.name,
  };
}

async function fund(api: ApiClient, mode: Mode, amount: number, date: string): Promise<void> {
  const acc = ACCOUNTS[mode];
  const draft = await api.post(acc.path, {
    type: 'RECEIPT_VOUCHER_ENTRY',
    [acc.key]: acc.id,
    toFromAccountId: COUNTER.receipt.id,
    date,
    amount,
    particulars: 'e2e funding',
  });
  await api.post(`${acc.path}/${draft.voucherId}/approve`, {});
}

/** Random past day within [minBack, maxBack] days ago (inside the open financial period) so a date test has a day nobody else posts to. */
export function quietDay(minBack = 3, maxBack = 22): string {
  return isoDate(-(minBack + Math.floor(Math.random() * (maxBack - minBack + 1))));
}

/**
 * GL posting runs through an outbox worker, so a freshly approved entry reaches the Cash & Bank Book report
 * (and the balance used to validate payments) some seconds later. Polls the report API until it shows.
 */
export async function waitPosted(api: ApiClient, ...entries: BookEntry[]): Promise<void> {
  for (const entry of entries) {
    const acc = ACCOUNTS[entry.mode];
    await expect
      .poll(
        async () => {
          const rep = await api.get('/reports/cash-book', {
            fromDate: entry.date,
            toDate: entry.date,
            accountId: acc.id,
          });
          const rows: { voucherNumber?: string }[] = rep.accounts?.[0]?.entries ?? [];
          return rows.some((r) => r.voucherNumber === entry.voucherNumber);
        },
        { message: `${entry.voucherNumber} posted to the GL`, timeout: 120_000, intervals: [1000] },
      )
      .toBe(true);
  }
}
