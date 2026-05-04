import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddr(addr: string, len = 4): string {
  if (!addr) return '';
  if (addr.length <= len * 2 + 1) return addr;
  return `${addr.slice(0, len)}…${addr.slice(-len)}`;
}

export function formatNumber(n: number | string): string {
  const num = typeof n === 'string' ? Number(n.replace(/,/g, '')) : n;
  if (!isFinite(num)) return '0';
  return num.toLocaleString('en-US');
}

export function parseSupply(s: string): bigint {
  const cleaned = s.replace(/,/g, '').trim();
  if (!cleaned) return 0n;
  return BigInt(cleaned);
}

/**
 * Parse a human-readable token amount (e.g. `1,000.5`) into raw on-chain units
 * for a mint with `decimals` fractional digits. Truncates extra fractional digits.
 */
export function parseUiAmountToRawUnits(uiAmount: string, decimals: number): bigint {
  const cleaned = uiAmount.replace(/,/g, '').trim();
  if (!cleaned) return 0n;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('Invalid mint decimals');
  }
  const neg = cleaned.startsWith('-');
  const body = (neg ? cleaned.slice(1) : cleaned).trim();
  if (!body) return 0n;
  if (!/^\d*\.?\d*$/.test(body)) {
    throw new Error('Amount must be a number, e.g. 1000 or 12.345678');
  }
  const [intRaw, fracRaw = ''] = body.includes('.') ? body.split('.', 2) : [body, ''];
  const intDigits = (intRaw || '0').replace(/\D/g, '') || '0';
  const fracDigitsOnly = fracRaw.replace(/\D/g, '');
  const fracPadded = (fracDigitsOnly + '0'.repeat(decimals)).slice(0, decimals);
  const intNorm = intDigits.replace(/^0+(?=\d)/, '') || '0';
  const raw = BigInt(intNorm) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
  return neg ? -raw : raw;
}
