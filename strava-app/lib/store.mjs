import { StravaError } from "./security.mjs";

export function createStravaStore(env) {
  if (!env?.STRAVA_STORE || typeof env.STRAVA_STORE.getConnection !== "function") {
    throw new StravaError("strava_storage_unavailable");
  }
  return env.STRAVA_STORE;
}
