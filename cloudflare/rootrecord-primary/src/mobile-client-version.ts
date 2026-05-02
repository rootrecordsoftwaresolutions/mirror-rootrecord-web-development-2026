import { json } from "./cors";

/** Optional Worker vars — bump min_* when you need users on newer builds. */
export interface MobileVersionEnv {
  MIN_APP_VERSION_WEATHER?: string;
  MIN_APP_VERSION_BM?: string;
  PLAY_STORE_URL_WEATHER?: string;
  PLAY_STORE_URL_BM?: string;
}

const DEF_MIN_WEATHER = "1.0.16";
const DEF_MIN_BM = "1.06";
const DEF_PLAY_WEATHER = "https://play.google.com/store/apps/details?id=com.rootrecord.weathermanager";
const DEF_PLAY_BM = "https://play.google.com/store/apps/details?id=com.rootrecord.businessmanager";

/**
 * GET /api/mobile/version-policy?app_id=...
 * Unauthenticated. Native apps call this on the sign-in screen to compare against package version.
 */
export function handleMobileVersionPolicy(request: Request, env: MobileVersionEnv): Response {
  const url = new URL(request.url);
  const appId = (url.searchParams.get("app_id") || "").trim();
  const isBm = appId.includes("business_manager");
  const rawMin = isBm ? env.MIN_APP_VERSION_BM : env.MIN_APP_VERSION_WEATHER;
  const rawUrl = isBm ? env.PLAY_STORE_URL_BM : env.PLAY_STORE_URL_WEATHER;
  const min_version = String(rawMin || "").trim() || (isBm ? DEF_MIN_BM : DEF_MIN_WEATHER);
  const update_url = String(rawUrl || "").trim() || (isBm ? DEF_PLAY_BM : DEF_PLAY_WEATHER);

  return json(
    {
      app_id: appId || null,
      min_version,
      update_url,
    },
    200
  );
}
