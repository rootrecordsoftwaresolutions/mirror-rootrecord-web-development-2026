/**
 * Marketing / account portal (static HTML + account.js) on rootrecord.info.
 * Solana Tools embeds these pages in-app while keeping the same URLs as the main site.
 */
export const ROOTRECORD_PORTAL_ORIGIN_DEFAULT = 'https://rootrecord.info';

export function getRootRecordPortalOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_ROOTRECORD_PORTAL_ORIGIN?.trim();
  const base = (raw || ROOTRECORD_PORTAL_ORIGIN_DEFAULT).replace(/\/+$/, '');
  try {
    const u = new URL(base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ROOTRECORD_PORTAL_ORIGIN_DEFAULT;
    return u.origin;
  } catch {
    return ROOTRECORD_PORTAL_ORIGIN_DEFAULT;
  }
}

/** Absolute URL on the portal (path must start with `/`, may include `.html`). */
export function portalAbsoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getRootRecordPortalOrigin()}${p}`;
}
