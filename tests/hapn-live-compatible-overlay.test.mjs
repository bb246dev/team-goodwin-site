import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const CHECKPOINT = "4c0526b72282d5d681639285ead91b709cc410d6";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const candidateRoot = fileURLToPath(new URL(
  "../production-merge/hapn-api2-live-compatible-2026-09-09/goodwin-strava-api/",
  import.meta.url,
));
const node22 = process.env.GOODWIN_NODE_22
  || "/Users/micah/.npm/_npx/5dad66f2cb301fc2/node_modules/node/bin/node";

function completeEnvironment() {
  return {
    ...process.env,
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "3306",
    MYSQL_DATABASE: "test_only",
    MYSQL_USER: "test_only",
    MYSQL_PASSWORD: "test-only-password",
    STRAVA_CLIENT_ID: "123456",
    STRAVA_CLIENT_SECRET: "test-only-client-secret",
    STRAVA_VERIFY_TOKEN: "test-only-webhook-verifier-0000000000",
    STRAVA_ADMIN_TOKEN: "test-only-administrator-password-000000",
    STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  };
}

function installMysqlFixture(applicationRoot) {
  const mysqlRoot = join(applicationRoot, "node_modules/mysql2");
  mkdirSync(mysqlRoot, { recursive: true });
  writeFileSync(join(mysqlRoot, "package.json"), JSON.stringify({
    name: "mysql2",
    type: "module",
    exports: { "./promise": "./promise.js" },
  }));
  writeFileSync(join(mysqlRoot, "promise.js"), `
const races = Array.from({ length: 50 }, (_, index) => ({
  race_id: \`ggma-2026-\${String(index + 1).padStart(2, "0")}\`,
  race_number: index + 1,
  race_date: \`2026-\${String((index % 12) + 1).padStart(2, "0")}-01\`,
  state: \`State \${index + 1}\`,
  city: \`City \${index + 1}\`,
  strava_activity_id: null,
}));
const pool = {
  async execute(sql) {
    const statement = String(sql);
    if (statement.includes("COUNT(*) AS race_count")) {
      return [[{ race_count: 50, number_count: 50, first_race: 1, last_race: 50 }], []];
    }
    if (statement.includes("FROM ggma_race_schedule AS schedule")) return [races, []];
    return [[], []];
  },
  async getConnection() { throw new Error("not used by this startup fixture"); },
  async end() {},
};
export default { createPool() { return pool; } };
`);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForOk(port, child, stderr) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Passenger exited early: ${stderr()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.status === 200) return response;
    } catch { /* Passenger has not started listening yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Passenger health did not become ready: ${stderr()}`);
}

test("4c0526b accepts the exact HAPN-only three-file overlay through Passenger", async (t) => {
  assert.equal(execFileSync(node22, ["--version"], { encoding: "utf8" }).trim(), "v22.23.2");
  const fixture = mkdtempSync(join(tmpdir(), "goodwin-hapn-live-overlay-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const archive = join(fixture, "base.tar");
  execFileSync("git", [
    "archive", "--format=tar", `--output=${archive}`, CHECKPOINT, "strava-app",
  ], { cwd: repositoryRoot });
  execFileSync("tar", ["-xf", archive, "-C", fixture, "--strip-components=1"]);

  const packageBefore = readFileSync(join(fixture, "package.json"));
  const lockBefore = readFileSync(join(fixture, "package-lock.json"));
  cpSync(join(candidateRoot, "app.js"), join(fixture, "app.js"));
  cpSync(join(candidateRoot, "lib/hapn-route.mjs"), join(fixture, "lib/hapn-route.mjs"));
  cpSync(join(candidateRoot, "lib/hapn-tracking-core.mjs"), join(fixture, "lib/hapn-tracking-core.mjs"));
  assert.deepEqual(readFileSync(join(fixture, "package.json")), packageBefore);
  assert.deepEqual(readFileSync(join(fixture, "package-lock.json")), lockBefore);
  assert.doesNotMatch(readFileSync(join(fixture, "app.js"), "utf8"), /resumeWebhookEvents/);
  assert.equal(readFileSync(join(fixture, "lib/routes.mjs"), "utf8").includes("resumeWebhookEvents"), false);

  const overlayFiles = [
    join(fixture, "app.js"),
    join(fixture, "lib/hapn-route.mjs"),
    join(fixture, "lib/hapn-tracking-core.mjs"),
  ];
  for (const path of overlayFiles) execFileSync(node22, ["--check", path]);
  for (const path of overlayFiles) {
    execFileSync(node22, ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(path).href)})`]);
  }

  const application = await import(`${pathToFileURL(join(fixture, "app.js")).href}?config-test=1`);
  const configPath = join(fixture, "private-config.json");
  writeFileSync(configPath, JSON.stringify({
    HAPN_CLIENT_ID: "test-only-client-id",
    HAPN_CLIENT_SECRET: "test-only-client-secret",
    HAPN_DEVICE_IMEI: "000000000000000",
  }));
  const loaded = application.loadStartupEnvironment(completeEnvironment(), configPath);
  assert.equal(loaded.env.HAPN_CLIENT_ID, "test-only-client-id");
  assert.equal(loaded.env.HAPN_CLIENT_SECRET, "test-only-client-secret");
  assert.equal(loaded.env.HAPN_DEVICE_IMEI, "000000000000000");

  installMysqlFixture(fixture);
  const port = await availablePort();
  const child = spawn(node22, [
    "--eval", `globalThis.PhusionPassenger = {}; require(${JSON.stringify(join(fixture, "passenger.cjs"))});`,
  ], {
    env: { ...completeEnvironment(), PORT: String(port), IP: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill("SIGTERM"); });

  const health = await waitForOk(port, child, () => stderr);
  assert.deepEqual(await health.json(), { status: "ok", database: "ok" });

  const publicRaces = await fetch(`http://127.0.0.1:${port}/public/races`);
  assert.equal(publicRaces.status, 200);
  assert.equal((await publicRaces.json()).races.length, 50);
  const raceStatus = await fetch(`http://127.0.0.1:${port}/public/race-status`);
  assert.equal(raceStatus.status, 200);
  assert.equal((await raceStatus.json()).totalRaces, 50);
  assert.equal((await fetch(`http://127.0.0.1:${port}/status`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/connect`)).status, 401);

  const verifyUrl = new URL(`http://127.0.0.1:${port}/webhook`);
  verifyUrl.searchParams.set("hub.mode", "subscribe");
  verifyUrl.searchParams.set("hub.verify_token", completeEnvironment().STRAVA_VERIFY_TOKEN);
  verifyUrl.searchParams.set("hub.challenge", "unchanged-test-challenge");
  const webhook = await fetch(verifyUrl);
  assert.equal(webhook.status, 200);
  assert.deepEqual(await webhook.json(), { "hub.challenge": "unchanged-test-challenge" });

  const tracking = await fetch(`http://127.0.0.1:${port}/public/tracking-status`);
  assert.equal(tracking.status, 200);
  assert.deepEqual(await tracking.json(), { available: false });
  assert.equal(stderr, "");
});
