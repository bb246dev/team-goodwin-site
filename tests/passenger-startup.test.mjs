import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadStartupEnvironment } from "../strava-app/app.js";

const appPath = fileURLToPath(new URL("../strava-app/app.js", import.meta.url));
const passengerPath = fileURLToPath(new URL("../strava-app/passenger.cjs", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../strava-app/", import.meta.url));
const requiredEnvironment = [
  "MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD",
  "STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_VERIFY_TOKEN",
  "STRAVA_WEBHOOK_SUBSCRIPTION_ID", "STRAVA_ADMIN_TOKEN", "STRAVA_TOKEN_ENCRYPTION_KEY",
];
const publicDiagnosticFields = [
  "server", "configLoaded", "mysqlModuleLoaded", "mysqlPoolCreated",
  "databaseReachable", "stravaConfigValid", "startupErrorCategory",
  "encryptionKeyChars", "encryptionKeyDecodedBytes", "encryptionKeyEndsWithPadding",
];
const retiredStartupPaths = [
  "/health-startup", "/api/health-startup",
  "/node-test/health-startup", "/strava/health-startup",
];

function cleanEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !requiredEnvironment.includes(name)));
}

function completeEnvironment() {
  return {
    ...cleanEnvironment(),
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "3306",
    MYSQL_DATABASE: "test_only",
    MYSQL_USER: "test_only",
    MYSQL_PASSWORD: "test-only-password",
    STRAVA_CLIENT_ID: "123456",
    STRAVA_CLIENT_SECRET: "test-only-client-secret",
    STRAVA_VERIFY_TOKEN: "test-only-webhook-verifier-0000000000",
    STRAVA_WEBHOOK_SUBSCRIPTION_ID: "123",
    STRAVA_ADMIN_TOKEN: "test-only-administrator-password-000000",
    STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  };
}

async function inspectStartup(
  path,
  mode,
  env,
  ready = ({ healthStatus }) => healthStatus === 503,
  healthPath = "/health",
) {
  const port = await availablePort();
  const args = mode === "passenger"
    ? ["--eval", `globalThis.PhusionPassenger = {}; require(${JSON.stringify(path)});`]
    : [path];
  const child = spawn(process.execPath, args, {
    env: { ...env, PORT: String(port), IP: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let health;
  let healthStatus;
  let healthHeaders;
  let normalStatus;
  let retiredHealth;
  try {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`${mode} startup exited early: ${stdout}${stderr}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}${healthPath}`);
        const candidate = await response.json();
        if (ready({ health: candidate, healthStatus: response.status, stderr, stdout })) {
          health = candidate;
          healthStatus = response.status;
          healthHeaders = Object.fromEntries(response.headers);
          normalStatus = (await fetch(`http://127.0.0.1:${port}/api/strava/status`)).status;
          retiredHealth = await Promise.all(retiredStartupPaths.map(async (retiredPath) => {
            const retiredResponse = await fetch(`http://127.0.0.1:${port}${retiredPath}`);
            return {
              path: retiredPath,
              status: retiredResponse.status,
              body: await retiredResponse.json(),
            };
          }));
          await new Promise((resolve) => setTimeout(resolve, 25));
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    if (!health) throw new Error(`${mode} startup health did not respond as expected: ${stdout}${stderr}`);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 1_000);
    });
  }
  return { health, healthStatus, healthHeaders, normalStatus, retiredHealth, stdout, stderr };
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function verifyStartup(mode) {
  const path = mode === "passenger" ? passengerPath : appPath;
  const result = await inspectStartup(path, mode, completeEnvironment());
  assert.equal(result.healthStatus, 503);
  assert.deepEqual(result.health, { status: "unavailable" });
  assert.equal(result.healthHeaders["cache-control"], "no-store");
  assert.equal(result.healthHeaders["content-security-policy"], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(result.healthHeaders["referrer-policy"], "no-referrer");
  assert.equal(result.healthHeaders["x-content-type-options"], "nosniff");
  for (const field of publicDiagnosticFields) assert.equal(Object.hasOwn(result.health, field), false);
  for (const retired of result.retiredHealth) {
    assert.equal(retired.status, 404, retired.path);
    assert.deepEqual(retired.body, { error: "not_found" }, retired.path);
    for (const field of publicDiagnosticFields) assert.equal(Object.hasOwn(retired.body, field), false, `${retired.path}: ${field}`);
  }
  assert.equal(result.normalStatus, 503);
}

test("app.js starts with a generic unavailable health response", () => verifyStartup("direct"));

test("passenger.cjs starts the ES-module application without exposing startup details", () => verifyStartup("passenger"));

test("Passenger-stripped health path remains generic during initialization", async () => {
  const result = await inspectStartup(
    appPath,
    "direct",
    cleanEnvironment(),
    ({ stderr }) => stderr.includes("private config file missing"),
    "/health",
  );
  assert.equal(result.healthStatus, 503);
  assert.deepEqual(result.health, { status: "unavailable" });
  assert.equal(result.normalStatus, 503);
});

test("retained cPanel Strava mount path reaches only generic health during initialization", async () => {
  const result = await inspectStartup(
    appPath,
    "direct",
    cleanEnvironment(),
    ({ stderr }) => stderr.includes("private config file missing"),
    "/strava/health",
  );
  assert.equal(result.healthStatus, 503);
  assert.deepEqual(result.health, { status: "unavailable" });
  assert.equal(result.normalStatus, 503);
});

test("passenger.cjs reports a fixed category when app.js cannot be imported", async (t) => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "goodwin-strava-shim-")));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const fixtureShim = join(fixture, "passenger.cjs");
  cpSync(passengerPath, fixtureShim);
  const child = spawn(process.execPath, ["--eval", `require(${JSON.stringify(fixtureShim)});`], {
    env: cleanEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 1);
  assert.equal(stdout, "");
  assert.equal(stderr, "[goodwin-strava passenger] ES module dependency missing\n");
  assert.doesNotMatch(stderr, new RegExp(fixture, "i"));
});

test("private config fills only missing environment values from its allowlist", (t) => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "goodwin-strava-config-")));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const configPath = join(fixture, ".goodwin-strava-config.json");
  const config = {
    MYSQL_HOST: "file-host",
    MYSQL_PORT: "3306",
    MYSQL_DATABASE: "file-database",
    MYSQL_USER: "file-user",
    MYSQL_PASSWORD: "file-password",
    STRAVA_CLIENT_ID: "file-client-id",
    STRAVA_CLIENT_SECRET: "file-client-secret",
    STRAVA_VERIFY_TOKEN: "file-verify-token-000000000000000",
    STRAVA_WEBHOOK_SUBSCRIPTION_ID: "123",
    STRAVA_ADMIN_TOKEN: "file-admin-token-0000000000000000",
    STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    HAPN_CLIENT_ID: "file-hapn-client-id",
    HAPN_CLIENT_SECRET: "file-hapn-client-secret",
    HAPN_DEVICE_IMEI: "868239050345326",
    UNRELATED_VALUE: "must-not-load",
  };
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  const original = { MYSQL_HOST: "environment-host", MYSQL_PORT: "" };
  const loaded = loadStartupEnvironment(original, configPath);
  assert.deepEqual(loaded.diagnosticCategories, []);
  assert.equal(loaded.env.MYSQL_HOST, "environment-host");
  assert.equal(loaded.env.MYSQL_PORT, "3306");
  assert.equal(loaded.env.STRAVA_CLIENT_SECRET, "file-client-secret");
  assert.equal(loaded.env.HAPN_CLIENT_ID, "file-hapn-client-id");
  assert.equal(loaded.env.HAPN_CLIENT_SECRET, "file-hapn-client-secret");
  assert.equal(loaded.env.HAPN_DEVICE_IMEI, "868239050345326");
  assert.equal(loaded.env.UNRELATED_VALUE, undefined);
  assert.deepEqual(original, { MYSQL_HOST: "environment-host", MYSQL_PORT: "" });
});

test("private config rejects a numeric HAPN device identifier as malformed", (t) => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "goodwin-hapn-config-")));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const configPath = join(fixture, ".goodwin-strava-config.json");
  writeFileSync(configPath, JSON.stringify({ HAPN_DEVICE_IMEI: 868239050345326 }), { mode: 0o600 });
  const loaded = loadStartupEnvironment(completeEnvironment(), configPath);
  assert.deepEqual(loaded.diagnosticCategories, ["private config file malformed"]);
});

test("private config failures return fixed diagnostics without paths or contents", (t) => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "goodwin-strava-config-")));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const missingPath = join(fixture, "missing-private-config.json");
  assert.deepEqual(
    loadStartupEnvironment(cleanEnvironment(), missingPath).diagnosticCategories,
    ["private config file missing"],
  );
  const malformedPath = join(fixture, "malformed-private-config.json");
  const privateMarker = "never-print-this-private-config-value";
  writeFileSync(malformedPath, `{\"MYSQL_PASSWORD\":\"${privateMarker}\"`);
  const loaded = loadStartupEnvironment(cleanEnvironment(), malformedPath);
  assert.deepEqual(loaded.diagnosticCategories, ["private config file malformed"]);
  assert.doesNotMatch(JSON.stringify(loaded.diagnosticCategories), new RegExp(privateMarker));
  assert.doesNotMatch(JSON.stringify(loaded.diagnosticCategories), new RegExp(malformedPath));
});

test("startup diagnostics report missing configuration without exposing configured values", async () => {
  const password = "never-print-this-database-password";
  const clientSecret = "never-print-this-client-secret";
  const result = await inspectStartup(appPath, "direct", {
    ...cleanEnvironment(),
    MYSQL_PASSWORD: password,
    STRAVA_CLIENT_SECRET: clientSecret,
  }, ({ stderr }) => stderr.includes("missing MYSQL_HOST"));
  assert.equal(result.healthStatus, 503);
  assert.deepEqual(result.health, { status: "unavailable" });
  assert.match(result.stderr, /missing MYSQL_HOST/);
  assert.match(result.stderr, /missing STRAVA_TOKEN_ENCRYPTION_KEY/);
  assert.doesNotMatch(result.stderr, new RegExp(password));
  assert.doesNotMatch(result.stderr, new RegExp(clientSecret));
  assert.equal(result.stdout, "");
});

test("startup diagnostics report an invalid encryption-key format without printing it", async () => {
  const invalidKey = "never-print-this-invalid-encryption-key";
  const result = await inspectStartup(appPath, "direct", {
    ...completeEnvironment(),
    MYSQL_HOST: "",
    STRAVA_TOKEN_ENCRYPTION_KEY: invalidKey,
  }, ({ stderr }) => stderr.includes("invalid STRAVA_TOKEN_ENCRYPTION_KEY format"));
  assert.equal(result.healthStatus, 503);
  assert.deepEqual(result.health, { status: "unavailable" });
  assert.doesNotMatch(JSON.stringify(result.health), new RegExp(invalidKey));
  assert.match(result.stderr, /invalid STRAVA_TOKEN_ENCRYPTION_KEY format/);
  assert.doesNotMatch(result.stderr, new RegExp(invalidKey));
});

test("startup health does not distinguish a wrongly sized encryption key", async () => {
  const invalidKey = Buffer.alloc(31, 11).toString("base64");
  const result = await inspectStartup(appPath, "direct", {
    ...completeEnvironment(),
    MYSQL_HOST: "",
    STRAVA_TOKEN_ENCRYPTION_KEY: invalidKey,
  }, ({ stderr }) => stderr.includes("invalid STRAVA_TOKEN_ENCRYPTION_KEY format"));
  assert.equal(result.healthStatus, 503);
  assert.deepEqual(result.health, { status: "unavailable" });
  assert.doesNotMatch(JSON.stringify(result.health), new RegExp(invalidKey));
});

test("startup rejects a malformed webhook subscription ID without printing it", async () => {
  const invalidSubscription = "never-print-invalid-subscription";
  const result = await inspectStartup(appPath, "direct", {
    ...completeEnvironment(),
    MYSQL_HOST: "",
    STRAVA_WEBHOOK_SUBSCRIPTION_ID: invalidSubscription,
  }, ({ stderr }) => stderr.includes("invalid STRAVA_WEBHOOK_SUBSCRIPTION_ID format"));
  assert.equal(result.healthStatus, 503);
  assert.deepEqual(result.health, { status: "unavailable" });
  assert.match(result.stderr, /invalid STRAVA_WEBHOOK_SUBSCRIPTION_ID format/);
  assert.doesNotMatch(result.stderr, new RegExp(invalidSubscription));
});

test("startup diagnostics report a missing mysql2 module without exposing configuration", async (t) => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "goodwin-strava-startup-")));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  cpSync(join(sourceRoot, "app.js"), join(fixture, "app.js"));
  cpSync(join(sourceRoot, "package.json"), join(fixture, "package.json"));
  cpSync(join(sourceRoot, "lib"), join(fixture, "lib"), { recursive: true });
  const fixtureStore = join(fixture, "lib/mysql-store.mjs");
  writeFileSync(
    fixtureStore,
    readFileSync(fixtureStore, "utf8").replace("mysql2/promise", "mysql2-missing-for-startup-test/promise"),
  );
  const env = completeEnvironment();
  const result = await inspectStartup(
    join(fixture, "app.js"),
    "direct",
    env,
    ({ stderr }) => stderr.includes("mysql2 module load failure"),
  );
  assert.equal(result.healthStatus, 503);
  assert.deepEqual(result.health, { status: "unavailable" });
  assert.equal(result.normalStatus, 503);
  assert.match(result.stderr, /mysql2 module load failure/);
  for (const name of requiredEnvironment) assert.doesNotMatch(result.stderr, new RegExp(env[name]));
});
