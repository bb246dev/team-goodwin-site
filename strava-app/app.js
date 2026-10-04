import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { handleStravaRequest, resumeWebhookEvents } from "./lib/routes.mjs";
import { requiredSecret, StravaError, tokenEncryptionKey } from "./lib/security.mjs";
import { STRAVA_PUBLIC_ORIGIN } from "./lib/service.mjs";
import {
  HAPN_PUBLIC_PATH,
  createHapnPublicRateLimiter,
  handleHapnPublicRequest,
} from "./lib/hapn-route.mjs";

const REQUIRED_STARTUP_VALUES = [
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_DATABASE",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "STRAVA_CLIENT_ID",
  "STRAVA_CLIENT_SECRET",
  "STRAVA_VERIFY_TOKEN",
  "STRAVA_WEBHOOK_SUBSCRIPTION_ID",
  "STRAVA_ADMIN_TOKEN",
  "STRAVA_TOKEN_ENCRYPTION_KEY",
];
const OPTIONAL_STARTUP_VALUES = [
  "HAPN_CLIENT_ID",
  "HAPN_CLIENT_SECRET",
  "HAPN_DEVICE_IMEI",
  "HAPN_STALE_AFTER_SECONDS",
  "HAPN_RETENTION_SECONDS",
  "HAPN_PUBLIC_COORDINATE_DECIMALS",
];
const PRIVATE_CONFIG_VALUES = [...REQUIRED_STARTUP_VALUES, ...OPTIONAL_STARTUP_VALUES];
const PRIVATE_CONFIG_PATH = "/home/goodfjcw/.goodwin-strava-config.json";
const PRIVATE_CONFIG_MAX_BYTES = 16_384;
const SAFE_STARTUP_CATEGORIES = new Set([
  "mysql2 module load failure",
  "MySQL connection initialization failure",
  "MySQL authentication failure",
  "database/table initialization failure",
]);
const MYSQL_AUTHENTICATION_CODES = new Set([
  "ER_ACCESS_DENIED_ERROR",
  "ER_ACCESS_DENIED_NO_PASSWORD_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
]);
const MYSQL_DATABASE_CODES = new Set([
  "ER_BAD_DB_ERROR",
  "ER_BAD_TABLE_ERROR",
  "ER_COLUMNACCESS_DENIED_ERROR",
  "ER_NO_SUCH_TABLE",
  "ER_PARSE_ERROR",
  "ER_TABLEACCESS_DENIED_ERROR",
]);
const MYSQL_CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
]);
const PUBLIC_HEALTH_PATHS = new Set(["/health", "/strava/health"]);
const RETIRED_STARTUP_PATHS = new Set([
  "/health-startup",
  "/api/health-startup",
  "/node-test/health-startup",
  "/strava/health-startup",
]);
const HEALTH_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function configuredValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function currentDate(now) {
  if (typeof now !== "function") return new Date();
  const value = now();
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value) && value < 1_000_000_000_000) {
    return new Date(value * 1_000);
  }
  return new Date(value);
}

export function loadStartupEnvironment(processEnvironment = process.env, configPath = PRIVATE_CONFIG_PATH) {
  const env = { ...processEnvironment };
  const requiredEnvironmentComplete = REQUIRED_STARTUP_VALUES.every((name) => configuredValue(env[name]));

  let contents;
  try {
    contents = readFileSync(configPath);
  } catch (error) {
    if (requiredEnvironmentComplete) return { env, diagnosticCategories: [] };
    const category = error?.code === "ENOENT" ? "private config file missing" : "private config file unavailable";
    return { env, diagnosticCategories: [category] };
  }

  try {
    if (contents.length > PRIVATE_CONFIG_MAX_BYTES) throw new Error("invalid config size");
    const config = JSON.parse(contents.toString("utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("invalid config object");
    for (const name of PRIVATE_CONFIG_VALUES) {
      if (Object.hasOwn(config, name) && typeof config[name] !== "string") throw new Error("invalid config value");
    }
    for (const name of PRIVATE_CONFIG_VALUES) {
      if (!configuredValue(env[name]) && configuredValue(config[name])) env[name] = config[name];
    }
    return { env, diagnosticCategories: [] };
  } catch {
    return { env, diagnosticCategories: ["private config file malformed"] };
  }
}

function startupConfigurationDiagnostics(env) {
  const categories = REQUIRED_STARTUP_VALUES
    .filter((name) => typeof env?.[name] !== "string" || env[name].trim().length === 0)
    .map((name) => `missing ${name}`);
  const port = env?.MYSQL_PORT;
  if (typeof port === "string" && port.trim() && (!/^\d{1,5}$/.test(port.trim()) || Number(port) < 1 || Number(port) > 65535)) {
    categories.push("invalid MYSQL_PORT format");
  }
  const key = env?.STRAVA_TOKEN_ENCRYPTION_KEY;
  if (typeof key === "string" && key.trim() && !/^[A-Za-z0-9+/]{43}=$/.test(key)) {
    categories.push("invalid STRAVA_TOKEN_ENCRYPTION_KEY format");
  }
  const subscriptionId = env?.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
  if (typeof subscriptionId === "string" && subscriptionId.trim()
    && (!/^[1-9]\d{0,15}$/.test(subscriptionId.trim())
      || !Number.isSafeInteger(Number(subscriptionId.trim())))) {
    categories.push("invalid STRAVA_WEBHOOK_SUBSCRIPTION_ID format");
  }
  return categories;
}

function sanitizeStartupMessage(error, env) {
  let message = typeof error?.message === "string" ? error.message : "startup failed";
  const protectedValues = PRIVATE_CONFIG_VALUES
    .map((name) => env?.[name])
    .filter((value) => typeof value === "string" && value.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const value of protectedValues) message = message.replaceAll(value, "[redacted]");
  return message
    .replace(/\b(?:mysql|https?):\/\/[^\s]+/gi, "[redacted-url]")
    .replace(/((?:password|passwd|client[_ -]?secret|encryption[_ -]?key|token|authorization|database|username|user|host)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[redacted]")
    .replace(/[\r\n\t\0]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "?")
    .trim()
    .slice(0, 200) || "startup failed";
}

function startupDiagnostics(error, env) {
  if (Array.isArray(error?.startupCategories)) return error.startupCategories;
  if (SAFE_STARTUP_CATEGORIES.has(error?.startupCategory)) return [error.startupCategory];
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  if (MYSQL_AUTHENTICATION_CODES.has(code) || /access denied for user/i.test(message)) {
    return ["MySQL authentication failure"];
  }
  if (MYSQL_DATABASE_CODES.has(code) || /unknown database|no such table|table .* doesn't exist/i.test(message)) {
    return ["database/table initialization failure"];
  }
  if (MYSQL_CONNECTION_CODES.has(code)) return ["MySQL connection initialization failure"];
  const name = typeof error?.name === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
    ? error.name
    : "Error";
  return [`other startup exception ${name}: ${sanitizeStartupMessage(error, env)}`];
}

function writeStartupDiagnostics(error, env = process.env) {
  for (const category of startupDiagnostics(error, env)) {
    process.stderr.write(`[goodwin-strava startup] ${category}\n`);
  }
}

function waitForServer(server) {
  if (server.listening) return Promise.resolve();
  return new Promise((resolveStartup, rejectStartup) => {
    const onListening = () => {
      server.off("error", onError);
      resolveStartup();
    };
    const onError = (error) => {
      server.off("listening", onListening);
      rejectStartup(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });
}

function requestPath(rawUrl) {
  return new URL(rawUrl || "/", "http://passenger.local").pathname.replace(/\/+$/, "") || "/";
}

function publicHealthPath(rawUrl) {
  return PUBLIC_HEALTH_PATHS.has(requestPath(rawUrl));
}

function retiredStartupPath(rawUrl) {
  return RETIRED_STARTUP_PATHS.has(requestPath(rawUrl));
}

function writeJson(outgoing, statusCode, body) {
  outgoing.statusCode = statusCode;
  outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(HEALTH_HEADERS)) outgoing.setHeader(name, value);
  outgoing.end(JSON.stringify(body));
}

function writePublicHealth(outgoing, healthy) {
  writeJson(outgoing, healthy ? 200 : 503, { status: healthy ? "ok" : "unavailable" });
}

function writeRetiredStartupNotFound(outgoing) {
  writeJson(outgoing, 404, { error: "not_found" });
}

function writeStartupUnavailable(outgoing) {
  outgoing.statusCode = 503;
  outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
  outgoing.setHeader("Cache-Control", "no-store");
  outgoing.end(JSON.stringify({ error: "strava_unavailable" }));
}

function startupListener(activeListener) {
  return (incoming, outgoing) => {
    if (retiredStartupPath(incoming.url)) {
      writeRetiredStartupNotFound(outgoing);
      return;
    }
    const listener = activeListener();
    if (incoming.method === "GET" && publicHealthPath(incoming.url) && !listener) {
      writePublicHealth(outgoing, false);
      return;
    }
    if (!listener) {
      writeStartupUnavailable(outgoing);
      return;
    }
    void listener(incoming, outgoing);
  };
}

async function validateStravaConfiguration(env) {
  requiredSecret(env, "STRAVA_CLIENT_ID");
  requiredSecret(env, "STRAVA_CLIENT_SECRET");
  requiredSecret(env, "STRAVA_VERIFY_TOKEN", 32);
  const subscriptionId = requiredSecret(env, "STRAVA_WEBHOOK_SUBSCRIPTION_ID").trim();
  if (!/^[1-9]\d{0,15}$/.test(subscriptionId) || !Number.isSafeInteger(Number(subscriptionId))) {
    throw new StravaError("strava_not_configured");
  }
  requiredSecret(env, "STRAVA_ADMIN_TOKEN", 32);
  await tokenEncryptionKey(env);
}

function mountedPath(rawUrl) {
  const url = new URL(rawUrl || "/", "http://passenger.local");
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return `${url.pathname}${url.search}`;
  // LiteSpeed may retain the final /strava mount prefix in incoming.url.
  if (url.pathname === "/strava" || url.pathname.startsWith("/strava/")) {
    return `/api${url.pathname}${url.search}`;
  }
  // Passenger may instead strip the /strava mount prefix before app.js sees the request.
  if (["/connect", "/connect-link", "/connect-athlete", "/callback", "/status", "/webhook", "/candidates"].includes(url.pathname)
    || url.pathname.startsWith("/candidates/") || url.pathname.startsWith("/public/")) {
    return `/api/strava${url.pathname}${url.search}`;
  }
  return `/api${url.pathname.startsWith("/") ? "" : "/"}${url.pathname}${url.search}`;
}

function fetchRequest(request) {
  const method = request.method || "GET";
  const init = { method, headers: request.headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(request);
    init.duplex = "half";
  }
  return new Request(`${STRAVA_PUBLIC_ORIGIN}${mountedPath(request.url)}`, init);
}

async function writeResponse(response, outgoing) {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  if (!response.body) {
    outgoing.end();
    return;
  }
  await new Promise((resolveResponse, reject) => {
    Readable.fromWeb(response.body).on("error", reject).pipe(outgoing).on("finish", resolveResponse).on("error", reject);
  });
}

function reservedPublicRoute(path) {
  if (!path.startsWith("/api/public/")) return null;
  // The website and application share one HTTPS origin, so browser CORS headers
  // are unnecessary. This namespace remains empty until a safe public contract exists.
  return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export function createApplication({
  env = process.env, store, pool, fetchImpl = fetch, now, logger = console,
  scheduleBackground = (task, delay = 0) => {
    const run = () => void task();
    return delay > 0 ? setTimeout(run, delay) : setImmediate(run);
  },
} = {}) {
  if (!store) throw new StravaError("strava_storage_unavailable");
  const databasePool = pool || null;
  const runtimeStore = store;
  const runtime = { ...env, STRAVA_STORE: runtimeStore };
  const backgroundDependencies = { fetchImpl, now, logger, scheduleBackground };
  const hapnRateLimiter = createHapnPublicRateLimiter();

  scheduleBackground(async () => {
    try {
      await resumeWebhookEvents(runtime, backgroundDependencies);
    } catch {
      try { logger.info("strava_webhook_recovery_failed"); } catch { /* Logging is best effort. */ }
    }
  });

  const listener = async (incoming, outgoing) => {
    try {
      if (incoming.method === "GET" && publicHealthPath(incoming.url)) {
        try {
          await runtimeStore.ping();
          await writeResponse(new Response(JSON.stringify({ status: "ok" }), {
            headers: { ...HEALTH_HEADERS, "Content-Type": "application/json; charset=utf-8" },
          }), outgoing);
        } catch {
          await writeResponse(new Response(JSON.stringify({ status: "unavailable" }), {
            status: 503,
            headers: { ...HEALTH_HEADERS, "Content-Type": "application/json; charset=utf-8" },
          }), outgoing);
        }
        return;
      }
      const request = fetchRequest(incoming);
      const path = new URL(request.url).pathname.replace(/\/+$/, "");
      const clientAddress = incoming.socket?.remoteAddress || "unknown";
      const response = path === HAPN_PUBLIC_PATH
        ? await handleHapnPublicRequest(request, runtime, {
          fetchImpl,
          now: () => currentDate(now),
          rateLimiter: hapnRateLimiter,
          clientAddress,
        })
        : reservedPublicRoute(path) || await handleStravaRequest(
          request,
          runtime,
          { fetchImpl, now, logger, scheduleBackground, clientAddress },
        );
      await writeResponse(response, outgoing);
    } catch {
      if (!outgoing.headersSent) {
        outgoing.statusCode = 503;
        outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
        outgoing.setHeader("Cache-Control", "no-store");
      }
      outgoing.end(JSON.stringify({ error: "strava_unavailable" }));
    }
  };

  return {
    listener,
    checkDatabase: () => runtimeStore.ping(),
    async close() {
      if (databasePool) await databasePool.end();
    },
  };
}

export function startInitializedApplication(options = {}) {
  const application = createApplication(options);
  const server = createServer(application.listener);
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  const port = Number(options.env?.PORT || process.env.PORT || 3000);
  const host = options.env?.IP || process.env.IP || "127.0.0.1";
  server.listen(port, host);
  const shutdown = () => server.close(() => void application.close());
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return { server, ...application };
}

export async function startApplication(processEnvironment = process.env) {
  let application = null;
  let databasePool = null;
  const server = createServer(startupListener(() => application?.listener));
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  const port = Number(processEnvironment.PORT || 3000);
  const host = processEnvironment.IP || "127.0.0.1";
  const shutdown = () => server.close(() => {
    const close = application?.close() || databasePool?.end();
    if (close) void close.catch(() => {});
  });
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  try {
    server.listen(port, host);
    await waitForServer(server);
  } catch (error) {
    writeStartupDiagnostics(error, processEnvironment);
    process.exitCode = 1;
    return;
  }

  const recordCategories = (categories, env) => {
    if (categories.length === 0) return;
    writeStartupDiagnostics({ startupCategories: categories }, env);
  };

  const loaded = loadStartupEnvironment(processEnvironment);
  const { env } = loaded;
  const configLoaded = loaded.diagnosticCategories.length === 0;
  recordCategories(loaded.diagnosticCategories, env);

  const configurationCategories = startupConfigurationDiagnostics(env);
  recordCategories(configurationCategories, env);

  const stravaCategories = configurationCategories.filter((category) => category.includes("STRAVA_"));
  let stravaConfigValid = false;
  try {
    await validateStravaConfiguration(env);
    stravaConfigValid = true;
  } catch {
    if (stravaCategories.length === 0) recordCategories(["invalid Strava configuration"], env);
  }

  let storeModule;
  try {
    storeModule = await import("./lib/mysql-store.mjs");
  } catch (error) {
    const moduleError = error?.code === "ERR_MODULE_NOT_FOUND" && /mysql2/i.test(error?.message || "")
      ? { startupCategory: "mysql2 module load failure" }
      : error;
    const categories = startupDiagnostics(moduleError, env);
    writeStartupDiagnostics({ startupCategories: categories }, env);
    return;
  }

  const mysqlCategories = configurationCategories.filter((category) => category.includes("MYSQL_"));
  if (mysqlCategories.length > 0) return;

  try {
    databasePool = storeModule.createMySqlPool(env);
  } catch {
    const categories = ["MySQL connection initialization failure"];
    writeStartupDiagnostics({ startupCategories: categories }, env);
    return;
  }

  let runtimeStore;
  try {
    runtimeStore = storeModule.createMySqlStravaStore(databasePool);
    await runtimeStore.ping();
  } catch (error) {
    const categories = startupDiagnostics(error, env);
    writeStartupDiagnostics({ startupCategories: categories }, env);
    return;
  }

  if (!configLoaded || configurationCategories.length > 0 || !stravaConfigValid) return;

  try {
    application = createApplication({ env, store: runtimeStore, pool: databasePool });
  } catch (error) {
    const categories = startupDiagnostics(error, env);
    writeStartupDiagnostics({ startupCategories: categories }, env);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) void startApplication();
