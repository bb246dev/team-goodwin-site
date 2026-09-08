import { createHash } from "node:crypto";
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
const MAX_QUERY_BYTES = 4_096;
const WEBHOOK_RETENTION_SECONDS = 14 * 86_400;
const WEBHOOK_MAX_FUTURE_SECONDS = 300;
const WEBHOOK_RATE_WINDOW_SECONDS = 60;
const WEBHOOK_RATE_EVENT_LIMIT = 120;
const ADMIN_RATE_WINDOW_SECONDS = 300;
const ADMIN_RATE_FAILURE_LIMIT = 10;
// The final retry crosses the 60-second lease boundary so a queued event can
// reclaim work even when the preceding Passenger worker stalls until expiry.
const WEBHOOK_RETRY_DELAYS = [250, 1_000, 4_000, 10_000, 50_000];
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

function safeLog(logger, category, metadata = {}) {
  try {
    logger.info(category, metadata);
  } catch { /* Operational logging must never change request behavior. */ }
}

function webhookSubscriptionId(env) {
  const value = typeof env?.STRAVA_WEBHOOK_SUBSCRIPTION_ID === "string"
    ? env.STRAVA_WEBHOOK_SUBSCRIPTION_ID.trim() : "";
  if (!/^[1-9]\d{0,15}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? value : null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function webhookEventKey(event) {
  return createHash("sha256").update(canonicalJson({
    subscription_id: event.subscription_id,
    owner_id: event.owner_id,
    object_type: event.object_type,
    object_id: event.object_id,
    aspect_type: event.aspect_type,
    event_time: event.event_time,
    updates: event.updates || null,
  })).digest("hex");
}

function adminClientKey(clientAddress) {
  const value = typeof clientAddress === "string" && /^[0-9a-f:.]{1,64}$/i.test(clientAddress)
    ? clientAddress.toLowerCase() : "unknown";
  return createHash("sha256").update(value).digest("hex");
}

function scheduleWebhookBackground(dependencies, task, delay = 0) {
  if (typeof dependencies.scheduleBackground !== "function") return false;
  dependencies.scheduleBackground(task, delay);
  return true;
}

async function processWebhookEvent(eventKey, env, dependencies, attempt = 0) {
  const logger = dependencies.logger || console;
  const now = dependencies.now || (() => Math.floor(Date.now() / 1000));
  const store = createStravaStore(env);
  const owner = randomSecret();
  try {
    const claim = await store.claimWebhookEvent(eventKey, owner, now());
    if (claim.status === "duplicate") {
      safeLog(logger, "strava_webhook_duplicate_ignored");
      return;
    }
    if (claim.status === "stale") {
      safeLog(logger, "strava_webhook_stale_ignored", { activity_id: claim.activityId });
      return;
    }
    if (claim.status === "busy") {
      if (attempt < WEBHOOK_RETRY_DELAYS.length) {
        safeLog(logger, "strava_webhook_activity_queued", { retry: attempt + 1 });
        scheduleWebhookBackground(
          dependencies,
          () => processWebhookEvent(eventKey, env, dependencies, attempt + 1),
          WEBHOOK_RETRY_DELAYS[attempt],
        );
      } else {
        safeLog(logger, "strava_webhook_activity_deferred");
      }
      return;
    }
    const connection = await store.getConnection();
    if (!connection || connection.athlete_id !== claim.ownerId) {
      await store.finishWebhookEvent(eventKey, owner, { status: "ignored", advance: false }, now());
      safeLog(logger, "strava_webhook_wrong_athlete_ignored", { activity_id: claim.activityId });
      return;
    }
    if (claim.aspectType === "delete") {
      await store.deleteRaceActivityCandidate(claim.activityId, claim.eventTime, now());
    } else if (typeof dependencies.processWebhookActivity === "function") {
      await dependencies.processWebhookActivity(claim.activityId);
    } else {
      await createStravaService(env, dependencies).fetchActivityCandidate(claim.activityId);
    }
    await store.finishWebhookEvent(eventKey, owner, { status: "succeeded", advance: true }, now());
    safeLog(logger, "strava_webhook_activity_succeeded", {
      activity_id: claim.activityId,
      aspect_type: claim.aspectType,
    });
  } catch (error) {
    await store.finishWebhookEvent(eventKey, owner, { status: "failed", advance: false }, now()).catch(() => {});
    safeLog(logger, "strava_webhook_activity_failed", {
      error: error instanceof StravaError ? error.code : "strava_activity_candidate_failed",
    });
    if (attempt < WEBHOOK_RETRY_DELAYS.length) {
      scheduleWebhookBackground(
        dependencies,
        () => processWebhookEvent(eventKey, env, dependencies, attempt + 1),
        WEBHOOK_RETRY_DELAYS[attempt],
      );
    }
  }
}

export async function resumeWebhookEvents(env, dependencies = {}) {
  const logger = dependencies.logger || console;
  const now = dependencies.now || (() => Math.floor(Date.now() / 1000));
  const store = createStravaStore(env);
  const eventKeys = await store.listRecoverableWebhookEventKeys(now());
  for (const eventKey of eventKeys) {
    scheduleWebhookBackground(
      dependencies,
      () => processWebhookEvent(eventKey, env, dependencies),
    );
  }
  if (eventKeys.length > 0) {
    safeLog(logger, "strava_webhook_recovery_queued", { event_count: eventKeys.length });
  }
  return eventKeys.length;
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
    const validUpdates = (value) => {
      if (value === undefined) return true;
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const entries = Object.entries(value);
      return entries.length <= 16 && entries.every(([key, item]) =>
        /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)
        && (item === null || typeof item === "boolean" || Number.isFinite(item)
          || (typeof item === "string" && item.length <= 1_024)));
    };
    if (!event || typeof event !== "object" || Array.isArray(event) ||
      !["athlete", "activity"].includes(event.object_type) ||
      !["create", "update", "delete"].includes(event.aspect_type) ||
      ![event.object_id, event.owner_id, event.subscription_id, event.event_time].every(positiveId) ||
      !validUpdates(event.updates)) {
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
  const logger = dependencies.logger || console;
  try {
    if (Buffer.byteLength(url.search, "utf8") > MAX_QUERY_BYTES) {
      return stravaResponse({ error: "request_uri_too_long" }, 414, callbackHeaders);
    }
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
      const timestamp = now();
      safeLog(logger, "strava_webhook_received", {
        object_type: event.object_type,
        aspect_type: event.aspect_type,
        object_id: event.object_id,
      });
      const expectedSubscription = webhookSubscriptionId(env);
      if (!expectedSubscription) {
        safeLog(logger, "strava_webhook_config_unavailable");
        return stravaResponse({ accepted: true });
      }
      if (String(event.subscription_id) !== expectedSubscription) {
        safeLog(logger, "strava_webhook_wrong_subscription_ignored");
        return stravaResponse({ accepted: true });
      }
      if (event.event_time > timestamp + WEBHOOK_MAX_FUTURE_SECONDS) {
        safeLog(logger, "strava_webhook_future_event_ignored");
        return stravaResponse({ accepted: true });
      }
      if (event.object_type !== "activity") {
        safeLog(logger, "strava_webhook_non_activity_ignored");
        return stravaResponse({ accepted: true });
      }
      if (event.aspect_type !== "delete" && !operationalWindowAt(timestamp)) {
        safeLog(logger, "strava_webhook_window_closed_ignored", { object_id: event.object_id });
        return stravaResponse({ accepted: true });
      }
      const store = createStravaStore(env);
      const connection = await store.getConnection();
      if (!connection || connection.athlete_id !== String(event.owner_id)) {
        safeLog(logger, "strava_webhook_wrong_athlete_ignored", { object_id: event.object_id });
        return stravaResponse({ accepted: true });
      }
      if (!await store.consumeWebhookRateLimit(
        timestamp,
        WEBHOOK_RATE_WINDOW_SECONDS,
        WEBHOOK_RATE_EVENT_LIMIT,
      )) {
        safeLog(logger, "strava_webhook_rate_limit_triggered");
        return stravaResponse({ accepted: true });
      }
      const eventKey = webhookEventKey(event);
      const registration = await store.registerWebhookEvent(eventKey, event, timestamp, WEBHOOK_RETENTION_SECONDS);
      if (!registration.registered) safeLog(logger, "strava_webhook_duplicate_ignored", { object_id: event.object_id });
      if (registration.shouldSchedule) {
        safeLog(logger, "strava_webhook_activity_queued", {
          object_id: event.object_id,
          aspect_type: event.aspect_type,
        });
        scheduleWebhookBackground(dependencies, () => processWebhookEvent(eventKey, env, dependencies));
      }
      return stravaResponse({ accepted: true });
    }
    if (url.origin !== STRAVA_PUBLIC_ORIGIN) {
      return stravaResponse({ error: "strava_requires_production_origin" }, 400, callbackHeaders);
    }
    let store;
    if (!callback && !athleteConnect) {
      store = createStravaStore(env);
      const clientKey = adminClientKey(dependencies.clientAddress);
      if (!await authorizedAdmin(request, env)) {
        const rate = await store.recordAdminAuthFailure(
          clientKey,
          now(),
          ADMIN_RATE_WINDOW_SECONDS,
          ADMIN_RATE_FAILURE_LIMIT,
        );
        if (rate.limited) {
          safeLog(logger, "strava_admin_rate_limit_triggered", { route: path });
          return stravaResponse({ error: "rate_limited" }, 429, {
            "Retry-After": String(rate.retryAfter),
          });
        }
        return stravaResponse({ error: "unauthorized" }, 401, {
          "WWW-Authenticate": 'Basic realm="Goodwin Strava administration", charset="UTF-8"',
        });
      }
      await store.clearAdminAuthFailures(clientKey).catch(() => {});
    }
    if (path === "/api/strava/status") {
      const timestamp = now();
      return stravaResponse({
        ...await getStravaConnectionStatus(env, timestamp),
        ...raceWindowStatusAt(timestamp),
      });
    }
    store ||= createStravaStore(env);
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
