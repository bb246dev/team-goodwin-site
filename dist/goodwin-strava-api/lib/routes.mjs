import {
  StravaError, requiredSecret, secretEquals, randomSecret, hashSecret, tokenEncryptionKey,
} from "./security.mjs";
import { createStravaStore } from "./store.mjs";
import {
  STRAVA_ATHLETE_CONNECT_URL, STRAVA_CALLBACK_URL, STRAVA_PUBLIC_ORIGIN, STRAVA_SCOPES,
  stravaAppCredentials, createStravaService, getStravaConnectionStatus,
} from "./service.mjs";
import {
  operationalWindowAt, publicRaceResultsVisibleAt, raceWindowStatusAt,
} from "./race-window.mjs";

const STATE_COOKIE = "__Host-goodwin-strava-state";
const STATE_LIFETIME = 600;
const CONNECTION_LINK_LIFETIME = 86_400;
const MAX_WEBHOOK_BYTES = 16_384;
const MAX_ADMIN_BODY_BYTES = 4_096;
const ROUTES = new Set([
  "/api/strava/connect", "/api/strava/connect-link", "/api/strava/connect-athlete",
  "/api/strava/callback", "/api/strava/status", "/api/strava/webhook", "/api/strava/candidates",
  "/api/strava/public/races", "/api/strava/public/race-status",
]);

function stravaResponse(body, status = 200, headers = {}) {
  const values = new Headers({
    "Cache-Control": "no-store, private",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  if (typeof body === "string") {
    values.set("Content-Type", "text/plain; charset=utf-8");
    return new Response(body, { status, headers: values });
  }
  values.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: values });
}

function stateCookie(value, maxAge) {
  return `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function singleParameter(parameters, name) {
  const values = parameters.getAll(name);
  return values.length === 1 ? values[0] : null;
}

function readStateCookie(request) {
  const values = [];
  for (const item of (request.headers.get("cookie") || "").split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name === STATE_COOKIE) values.push(parts.join("="));
  }
  return values.length === 1 ? values[0] : "";
}

function connectionLinkFailure() {
  return stravaResponse({ error: "strava_connection_link_invalid" }, 400);
}

function publicHeaders(request, timestamp) {
  const active = operationalWindowAt(timestamp) !== null;
  const headers = {
    "Cache-Control": active
      ? "public, max-age=20, s-maxage=20, stale-while-revalidate=10"
      : "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
    Vary: "Origin",
  };
  if (request.headers.get("origin") === STRAVA_PUBLIC_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = STRAVA_PUBLIC_ORIGIN;
  }
  return headers;
}

function authorizationRedirect(clientId, state, browser) {
  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: STRAVA_CALLBACK_URL,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPES.join(","),
    state,
  }).toString();
  return stravaResponse("Redirecting to Strava.", 302, {
    Location: authorize.href,
    "Set-Cookie": stateCookie(browser, STATE_LIFETIME),
  });
}

async function authorizedAdmin(request, env) {
  const expected = requiredSecret(env, "STRAVA_ADMIN_TOKEN", 32);
  const authorization = request.headers.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) return secretEquals(authorization.slice(7), expected);
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
      if (!decoded.startsWith("strava:")) return false;
      return secretEquals(decoded.slice(7), expected);
    } catch {
      return false;
    }
  }
  return false;
}

async function webhookPayload(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new StravaError("strava_webhook_requires_json", 415);
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_WEBHOOK_BYTES)) {
    throw new StravaError("strava_webhook_too_large", 413);
  }
  if (!request.body) throw new StravaError("strava_invalid_webhook", 400);
  const reader = request.body.getReader();
  let timeout;
  try {
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new StravaError("strava_webhook_timeout", 408)), 1_000);
    });
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WEBHOOK_BYTES) throw new StravaError("strava_webhook_too_large", 413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const event = JSON.parse(new TextDecoder().decode(bytes));
    const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
    if (!event || typeof event !== "object" || Array.isArray(event) ||
      !["athlete", "activity"].includes(event.object_type) ||
      !["create", "update", "delete"].includes(event.aspect_type) ||
      ![event.object_id, event.owner_id, event.subscription_id, event.event_time].every(positiveId) ||
      (event.updates !== undefined && (!event.updates || typeof event.updates !== "object" || Array.isArray(event.updates)))) {
      throw new StravaError("strava_invalid_webhook", 400);
    }
    return event;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof StravaError) throw error;
    throw new StravaError("strava_invalid_webhook", 400);
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

async function assignmentPayload(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new StravaError("strava_admin_requires_json", 415);
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_ADMIN_BODY_BYTES)) {
    throw new StravaError("strava_admin_body_too_large", 413);
  }
  if (!request.body) throw new StravaError("strava_invalid_candidate_assignment", 400);
  const reader = request.body.getReader();
  let timeout;
  try {
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new StravaError("strava_admin_body_timeout", 408)), 1_000);
    });
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ADMIN_BODY_BYTES) throw new StravaError("strava_admin_body_too_large", 413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== "raceId") ||
      !/^ggma-2026-(?:0[1-9]|[1-4]\d|50)$/.test(payload.raceId || "")) {
      throw new StravaError("strava_invalid_candidate_assignment", 400);
    }
    return payload;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof StravaError) throw error;
    throw new StravaError("strava_invalid_candidate_assignment", 400);
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

export async function handleStravaRequest(request, env = {}, dependencies = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const callback = path === "/api/strava/callback";
  const callbackHeaders = callback ? { "Set-Cookie": stateCookie("", 0) } : {};
  const now = dependencies.now || (() => Math.floor(Date.now() / 1000));
  try {
    const webhook = path === "/api/strava/webhook";
    const connectionLink = path === "/api/strava/connect-link";
    const athleteConnect = path === "/api/strava/connect-athlete";
    const candidateReview = path === "/api/strava/candidates";
    const candidateAssignment = /^\/api\/strava\/candidates\/([1-9]\d{0,19})\/assign$/.exec(path);
    const publicRaces = path === "/api/strava/public/races";
    const publicRaceStatus = path === "/api/strava/public/race-status";
    if (!ROUTES.has(path) && !candidateAssignment) return stravaResponse({ error: "not_found" }, 404);
    const allowed = webhook ? ["GET", "POST"]
      : connectionLink || candidateAssignment ? ["POST"] : ["GET"];
    if (!allowed.includes(request.method)) {
      return stravaResponse({ error: "method_not_allowed" }, 405, { Allow: allowed.join(", ") });
    }
    if (publicRaces || publicRaceStatus) {
      const timestamp = now();
      const races = await createStravaStore(env).listPublicRaces(publicRaceResultsVisibleAt(timestamp));
      if (publicRaceStatus) {
        const window = raceWindowStatusAt(timestamp);
        return stravaResponse({
          active: window.raceWindowActive,
          raceWindowId: window.raceWindowId,
          raceWindowStart: window.raceWindowStart,
          raceWindowEnd: window.raceWindowEnd,
          completedRaces: races.filter((race) => race.status === "completed").length,
          totalRaces: races.length,
        }, 200, publicHeaders(request, timestamp));
      }
      return stravaResponse({ races }, 200, publicHeaders(request, timestamp));
    }
    if (webhook) {
      if (request.method === "GET") {
        const expected = requiredSecret(env, "STRAVA_VERIFY_TOKEN", 32);
        const challenge = singleParameter(url.searchParams, "hub.challenge");
        if (singleParameter(url.searchParams, "hub.mode") !== "subscribe" || !challenge || challenge.length > 1024 ||
          !await secretEquals(singleParameter(url.searchParams, "hub.verify_token"), expected)) {
          return stravaResponse({ error: "strava_webhook_verification_failed" }, 403);
        }
        return stravaResponse({ "hub.challenge": challenge });
      }
      const event = await webhookPayload(request);
      // Acknowledge valid activity events outside the race window without beginning
      // processing. Any future activity-detail fetch must remain below this gate.
      if (event.object_type === "activity" && !operationalWindowAt(now())) {
        return stravaResponse({ accepted: true });
      }
      const logger = dependencies.logger || console;
      // Strava does not sign event POSTs. Treat them as hints and log only allowlisted metadata.
      // A future sync must validate owner/subscription and confirm the event with Strava.
      try {
        logger.info("strava_webhook", {
          object_type: event.object_type,
          aspect_type: event.aspect_type,
          object_id: event.object_id,
          owner_id: event.owner_id,
          event_time: event.event_time,
        });
      } catch { /* Logging must not cause Strava retries. */ }
      if (event.object_type === "activity" && ["create", "update"].includes(event.aspect_type)
        && typeof dependencies.scheduleBackground === "function") {
        dependencies.scheduleBackground(async () => {
          try {
            const connection = await createStravaStore(env).getConnection();
            if (!connection || connection.athlete_id !== String(event.owner_id)) {
              throw new StravaError("strava_activity_owner_mismatch", 403);
            }
            await createStravaService(env, dependencies).fetchActivityCandidate(event.object_id);
          } catch (error) {
            try {
              logger.info("strava_activity_candidate_error", {
                object_id: event.object_id,
                error: error instanceof StravaError ? error.code : "strava_activity_candidate_failed",
              });
            } catch { /* Background diagnostics must remain best-effort and secret-free. */ }
          }
        });
      }
      return stravaResponse({ accepted: true });
    }
    if (url.origin !== STRAVA_PUBLIC_ORIGIN) {
      return stravaResponse({ error: "strava_requires_production_origin" }, 400, callbackHeaders);
    }
    if (!callback && !athleteConnect && !await authorizedAdmin(request, env)) {
      return stravaResponse({ error: "unauthorized" }, 401, {
        "WWW-Authenticate": 'Basic realm="Goodwin Strava administration", charset="UTF-8"',
      });
    }
    if (path === "/api/strava/status") {
      const timestamp = now();
      return stravaResponse({
        ...await getStravaConnectionStatus(env, timestamp),
        ...raceWindowStatusAt(timestamp),
      });
    }
    const store = createStravaStore(env);
    if (candidateReview) {
      return stravaResponse({
        candidates: await store.listPendingRaceCandidates(),
        races: await store.listRaceSchedule(),
      });
    }
    if (candidateAssignment) {
      const { raceId } = await assignmentPayload(request);
      if (!await store.assignRaceCandidate(candidateAssignment[1], raceId, now())) {
        throw new StravaError("strava_candidate_assignment_conflict", 409);
      }
      return stravaResponse({ assigned: true, activityId: candidateAssignment[1], raceId });
    }
    if (connectionLink) {
      const { client_id } = stravaAppCredentials(env);
      await tokenEncryptionKey(env);
      const token = randomSecret();
      const expiresAt = now() + CONNECTION_LINK_LIFETIME;
      await store.createConnectionLink(await hashSecret(token), expiresAt, now());
      const link = new URL(STRAVA_ATHLETE_CONNECT_URL);
      link.searchParams.set("token", token);
      return stravaResponse(link.href, 201);
    }
    if (path === "/api/strava/connect" || athleteConnect) {
      const connectionToken = athleteConnect ? singleParameter(url.searchParams, "token") : null;
      if (athleteConnect && !/^[A-Za-z0-9_-]{43}$/.test(connectionToken || "")) return connectionLinkFailure();
      const { client_id } = stravaAppCredentials(env);
      await tokenEncryptionKey(env);
      const state = randomSecret();
      const browser = randomSecret();
      const stateHash = await hashSecret(state);
      const browserHash = await hashSecret(browser);
      if (athleteConnect) {
        const redeemed = await store.redeemConnectionLink(
          await hashSecret(connectionToken), stateHash, browserHash,
          now() + STATE_LIFETIME, now(),
        );
        if (!redeemed) return connectionLinkFailure();
      } else {
        await store.createState(stateHash, browserHash, now() + STATE_LIFETIME, now());
      }
      return authorizationRedirect(client_id, state, browser);
    }
    const state = singleParameter(url.searchParams, "state");
    const browser = readStateCookie(request);
    if (!/^[A-Za-z0-9_-]{43}$/.test(state || "") || !/^[A-Za-z0-9_-]{43}$/.test(browser) ||
      !await store.consumeState(await hashSecret(state), await hashSecret(browser), now())) {
      return stravaResponse(
        "The Strava connection request is invalid or expired. Start again from /strava/connect.",
        400,
        callbackHeaders,
      );
    }
    if (url.searchParams.has("error")) {
      return stravaResponse(
        "Strava authorization was declined or cancelled. Nothing was changed. You can start again from /strava/connect.",
        400,
        callbackHeaders,
      );
    }
    const code = singleParameter(url.searchParams, "code");
    const scope = singleParameter(url.searchParams, "scope");
    if (!code || code.length > 2048 || !scope || scope.length > 1024) {
      throw new StravaError("strava_invalid_callback", 400);
    }
    const scopes = [...new Set(scope.split(",").map((item) => item.trim()).filter(Boolean))];
    if (!STRAVA_SCOPES.every((item) => scopes.includes(item))) {
      throw new StravaError("strava_required_scopes_not_granted", 400);
    }
    await createStravaService(env, dependencies).connect(code, scopes);
    return stravaResponse("Strava is connected. You can close this page.", 200, callbackHeaders);
  } catch (error) {
    return stravaResponse(
      { error: error instanceof StravaError ? error.code : "strava_unavailable" },
      error instanceof StravaError ? error.status : 503,
      callbackHeaders,
    );
  }
}
