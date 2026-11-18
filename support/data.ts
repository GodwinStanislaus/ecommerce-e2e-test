let counter = 0;

/** Unique per call, even within one millisecond or across parallel workers. */
export function uid(prefix = 'E2E'): string {
  counter += 1;
  const worker = process.env['TEST_PARALLEL_INDEX'] ?? '0';
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${worker}${counter}`;
}

/** yyyy-mm-dd in local time, offset by whole days. */
export function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Rounds to 2 decimals the way money is shown, avoiding float drift in expectations. */
export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Parses "₹1,23,456.70" / "1,234.50 Dr" style cell text into a number. */
export function parseMoney(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  return cleaned ? Number(cleaned) : 0;
}

/** Tamil Nadu supplier/customer state: the API returns the GST code ('33') on some environments and 'TN' on others. */
export const isTamilNadu = (stateCode?: string | null): boolean => stateCode === '33' || stateCode === 'TN';
