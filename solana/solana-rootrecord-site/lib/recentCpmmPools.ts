const STORAGE_KEY = 'rr_recent_cpmm_pool_ids_v1';
const MAX = 12;

function readRaw(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((s) => s.length >= 32 && s.length <= 48);
  } catch {
    return [];
  }
}

export function readRecentCpmmPoolIds(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of readRaw()) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function rememberCpmmPoolId(poolId: string): void {
  if (typeof window === 'undefined') return;
  const id = poolId.trim();
  if (id.length < 32) return;
  try {
    const prev = readRaw().filter((x) => x !== id);
    prev.unshift(id);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}
