import { isoDate } from '../../support/data';
import type { ApiClient } from '../../support/api-client';

/** Valid GSTIN accepted by the API validator (same one the API's own examples use). */
export const GSTIN = '33AAACZ7367G1Z4';

export interface SeedLine {
  accountId: number;
  rate: number;
  gstRate?: number;
  quantity?: number;
  sacCode?: string;
  description?: string;
  itcEligible?: boolean;
}

export async function createSupplier(api: ApiClient, name: string, gstin: string | null = GSTIN) {
  return api.post<{ id: string; name: string }>('/supplier', {
    name,
    stateCode: '33',
    ...(gstin && { gstin }),
  });
}

interface Account {
  accountId: number;
  accountName: string;
  parentId: number | null;
}

/** First non-group expense head under "Direct Expenses" or "Indirect Expenses". */
export async function headUnder(api: ApiClient, kind: 'direct' | 'indirect'): Promise<Account> {
  const parentName = kind === 'direct' ? 'Direct Expenses' : 'Indirect Expenses';
  const groups = await api.get<Account[]>('/account-master', { accountType: 'Expense', isGroup: true });
  const parent = groups.find((g) => g.accountName === parentName);
  if (!parent) throw new Error(`No "${parentName}" group in this business`);
  const heads = await api.get<Account[]>('/account-master', { accountType: 'Expense', isGroup: false });
  const head = heads.find((h) => h.parentId === parent.accountId);
  if (!head) throw new Error(`No head under "${parentName}"`);
  return head;
}

export async function accountByName(api: ApiClient, name: string): Promise<Account> {
  const all = await api.get<Account[]>('/account-master');
  const found = all.find((a) => a.accountName === name);
  if (!found) throw new Error(`No account named "${name}"`);
  return found;
}

/** Posts a supplier bill through the API (arrange step). */
export async function seedBill(
  api: ApiClient,
  opts: {
    supplierId: string;
    billNo: string;
    lines: SeedLine[];
    paymentMode?: 'CASH' | 'CREDIT';
    paymentAccountId?: number;
    entryDate?: string;
    billDate?: string;
    billTotal?: number;
  },
) {
  return api.post<{ id: string; voucherNo: string }>('/expense-entries', {
    supplierId: opts.supplierId,
    entryDate: opts.entryDate ?? isoDate(0),
    billNo: opts.billNo,
    billDate: opts.billDate ?? opts.entryDate ?? isoDate(0),
    paymentMode: opts.paymentMode ?? 'CREDIT',
    ...(opts.paymentAccountId && { paymentAccountId: opts.paymentAccountId }),
    ...(opts.billTotal !== undefined && { billTotal: opts.billTotal }),
    lines: opts.lines.map((l) => ({
      accountId: l.accountId,
      rate: l.rate,
      quantity: l.quantity ?? 1,
      gstRate: l.gstRate ?? 18,
      sacCode: l.sacCode ?? '998599',
      itcEligible: l.itcEligible ?? true,
      ...(l.description && { description: l.description }),
    })),
  });
}
