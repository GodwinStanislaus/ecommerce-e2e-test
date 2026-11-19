/** Signature prerequisites. confirm/fulfil fail with USER_SIGNATURE_MISSING for a staff user who has none. */
import type { ApiClient } from '../../support/api-client';

export interface StaffUser {
  id: string;
  name: string;
  hasSignature: boolean;
}

/** Active staff users (admin, sales, accounts ...), as the Users screen's staff tab lists them. */
export async function listStaffUsers(api: ApiClient): Promise<StaffUser[]> {
  const res = await api.get('/user', { roleCategory: 'staff', limit: 100, page: 1 });
  return res.users
    .filter((u: any) => u.isActive)
    .map((u: any) => ({ id: u.id as string, name: u.name as string, hasSignature: !!u.hasSignature }));
}
