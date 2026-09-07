import { StravaError, requiredSecret, tokenEncryptionKey, encryptTokens, decryptTokens, randomSecret } from "./security.mjs";
import { createStravaStore } from "./store.mjs";
import { canInitiateStravaActivityFetch } from "./race-window.mjs";
import { processRaceActivityCandidate } from "./race-matching.mjs";

export const STRAVA_PUBLIC_ORIGIN = "https://goodwingoodge.com";
export const STRAVA_CALLBACK_URL = `${STRAVA_PUBLIC_ORIGIN}/strava/callback`;
export const STRAVA_WEBHOOK_URL = `${STRAVA_PUBLIC_ORIGIN}/strava/webhook`;
export const STRAVA_ATHLETE_CONNECT_URL = `${STRAVA_PUBLIC_ORIGIN}/strava/connect-athlete`;
export const STRAVA_SCOPES = ["read", "activity:read_all"];
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_PROVIDER_ORIGIN = "https://www.strava.com";

export function stravaAppCredentials(env) {
  const clientId = requiredSecret(env, "STRAVA_CLIENT_ID");
  if (!/^\d+$/.test(clientId)) throw new StravaError("strava_not_configured");
  return { client_id: clientId, client_secret: requiredSecret(env, "STRAVA_CLIENT_SECRET") };
}

function validTokenResponse(payload, now) {
  if (!payload || ![payload.access_token, payload.refresh_token].every((token) =>
    typeof token === "string" && token.length > 0 && token.length <= 4096) ||
    !Number.isSafeInteger(payload.expires_at) || payload.expires_at <= now || payload.expires_at > 8_640_000_000) {
    throw new StravaError("strava_invalid_token_response", 502);
  }
  return payload;
}

export function createStravaService(env, { fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  const store = createStravaStore(env);
  async function exchange(parameters) {
    try {
      const response = await fetchImpl(STRAVA_TOKEN_URL, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...stravaAppCredentials(env), ...parameters }),
        redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new StravaError(response.status === 400 || response.status === 401
          ? "strava_reauthorization_required" : "strava_token_exchange_failed", 502);
      }
      return validTokenResponse(await response.json(), now());
    } catch (error) {
      // Never propagate fetch errors, provider bodies, or request details containing secrets.
      if (error instanceof StravaError) throw error;
      throw new StravaError("strava_token_exchange_failed", 502);
    }
  }

  async function withConnectionLock(operation) {
    const owner = randomSecret();
    if (!await store.acquireLock(owner)) throw new StravaError("strava_connection_busy", 409);
    try {
      return await operation(owner);
    } finally {
      await store.releaseLock(owner).catch(() => {});
    }
  }

  async function persistTokens(key, current, payload, owner) {
    const next = {
      ...current,
      encrypted_tokens: await encryptTokens(key, current.athlete_id, {
        access_token: payload.access_token, refresh_token: payload.refresh_token,
      }),
      expires_at: payload.expires_at,
      updated_at: now(),
    };
    for (let attempt = 0; ; attempt += 1) {
      try {
        await store.saveConnection(next, owner);
        return next;
      } catch (error) {
        if (error instanceof StravaError || attempt === 2) throw new StravaError("strava_credentials_save_failed");
      }
    }
  }

  return {
    async connect(code, scopes) {
      const key = await tokenEncryptionKey(env);
      return withConnectionLock(async (owner) => {
        const previous = await store.getConnection();
        const payload = await exchange({ grant_type: "authorization_code", code });
        const athlete = payload.athlete;
        if (!athlete || !Number.isSafeInteger(athlete.id) || athlete.id <= 0) throw new StravaError("strava_invalid_athlete", 502);
        const athleteId = String(athlete.id);
        if (previous && previous.athlete_id !== athleteId) throw new StravaError("strava_different_athlete", 409);
        const name = [athlete.firstname, athlete.lastname]
          .filter((part) => typeof part === "string").join(" ").trim().slice(0, 200);
        await persistTokens(key, { athlete_id: athleteId, athlete_name: name, scopes: JSON.stringify(scopes) }, payload, owner);
      });
    },

    async getAccessToken() {
      const key = await tokenEncryptionKey(env);
      const current = await store.getConnection();
      if (!current) throw new StravaError("strava_not_connected", 409);
      if (current.expires_at > now() + 300) {
        return (await decryptTokens(key, current.athlete_id, current.encrypted_tokens)).access_token;
      }
      return withConnectionLock(async (owner) => {
        const latest = await store.getConnection();
        if (!latest) throw new StravaError("strava_not_connected", 409);
        const tokens = await decryptTokens(key, latest.athlete_id, latest.encrypted_tokens);
        if (latest.expires_at > now() + 300) return tokens.access_token;
        const payload = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
        await persistTokens(key, latest, payload, owner);
        return payload.access_token;
      });
    },

    async request(path, options = {}) {
      if (typeof path !== "string" || !/^\/[a-zA-Z]/.test(path) || /[\\#\r\n]/.test(path)) {
        throw new StravaError("strava_invalid_api_path", 400);
      }
      const url = new URL(`/api/v3${path}`, STRAVA_PROVIDER_ORIGIN);
      if (url.origin !== STRAVA_PROVIDER_ORIGIN || !url.pathname.startsWith("/api/v3/") || url.searchParams.has("access_token")) {
        throw new StravaError("strava_invalid_api_path", 400);
      }
      const activityDataRequest = url.pathname === "/api/v3/athlete/activities"
        || url.pathname === "/api/v3/activities"
        || url.pathname.startsWith("/api/v3/activities/");
      if (activityDataRequest && !canInitiateStravaActivityFetch(now())) {
        throw new StravaError("strava_operational_window_closed", 409);
      }
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${await this.getAccessToken()}`);
      try {
        const response = await fetchImpl(url, {
          ...options, headers, redirect: "error", signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new StravaError(response.status === 401 ? "strava_reauthorization_required" : "strava_api_request_failed", 502);
        }
        return response.status === 204 ? null : await response.json();
      } catch (error) {
        if (error instanceof StravaError) throw error;
        throw new StravaError("strava_api_request_failed", 502);
      }
    },

    async processActivityCandidate(activity) {
      return processRaceActivityCandidate(store, activity, now());
    },

    async fetchActivityCandidate(activityId) {
      const id = String(activityId);
      if (!/^[1-9]\d{0,19}$/.test(id)) throw new StravaError("strava_invalid_activity_candidate", 400);
      return this.processActivityCandidate(await this.request(`/activities/${id}`));
    },
  };
}

// Internal metadata only; this does not decrypt, refresh, or fetch Strava data.
export async function getStravaConnectionStatus(env, now = Math.floor(Date.now() / 1000)) {
  const connection = await createStravaStore(env).getConnection();
  if (!connection) return { connected: false };
  return {
    connected: true,
    athleteId: connection.athlete_id,
    athleteName: connection.athlete_name,
    tokenExpiresAt: new Date(connection.expires_at * 1000).toISOString(),
    tokenExpired: connection.expires_at <= now,
    scopes: JSON.parse(connection.scopes),
  };
}
