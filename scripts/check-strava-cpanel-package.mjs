import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = "dist/goodwin-strava-api";
const required = [
  "passenger.cjs", "app.js", "package.json", "package-lock.json", "README.md",
  "lib/mysql-store.mjs",
  "lib/race-matching.mjs", "lib/race-window.mjs", "lib/routes.mjs", "lib/security.mjs", "lib/service.mjs", "lib/store.mjs",
  "migrations/001_strava_oauth_mysql.sql", "migrations/002_strava_connection_links_mysql.sql",
  "migrations/003_strava_race_activity_candidates_mysql.sql",
  "migrations/004_ggma_race_schedule_mysql.sql",
  "migrations/004b_ggma_race_schedule_mariadb_repair.sql",
  "migrations/005_strava_candidate_runtime_fields_mariadb.sql",
  "seeds/001_ggma_2026_race_schedule_mysql.sql",
];

for (const entry of required) {
  const path = join(root, entry);
  if (!existsSync(path) || statSync(path).size === 0) throw new Error(`Missing cPanel artifact: ${entry}`);
}

const allFiles = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Deployment package contains a symlink: ${path}`);
    if (entry.isDirectory()) walk(path);
    else allFiles.push(path);
  }
}
walk(root);

const allowed = new Set(required);
for (const path of allFiles) {
  const name = relative(root, path);
  if (!allowed.has(name)) throw new Error(`Unexpected file in isolated cPanel package: ${name}`);
}

const source = allFiles.map((path) => readFileSync(path, "utf8")).join("\n");
for (const route of [
  "/api/strava/connect", "/api/strava/connect-link", "/api/strava/connect-athlete",
  "/api/strava/callback", "/api/strava/status", "/api/strava/webhook",
]) {
  if (!source.includes(route)) throw new Error(`Deployment package is missing ${route}`);
}
for (const diagnostic of [
  "/health-startup", "configLoaded", "mysqlModuleLoaded", "mysqlPoolCreated",
  "databaseReachable", "stravaConfigValid", "startupErrorCategory",
]) {
  if (!source.includes(diagnostic)) throw new Error(`Deployment package is missing startup diagnostic: ${diagnostic}`);
}
for (const table of [
  "strava_connection", "strava_oauth_states", "strava_refresh_lock",
  "strava_connection_links", "strava_race_activity_candidates", "strava_race_activity_matches", "ggma_race_schedule",
]) {
  if (!source.includes(table)) throw new Error(`Deployment package is missing ${table}`);
}
for (const boundary of ["2026-10-09T00:00:00-04:00", "2026-11-01T23:59:59-05:00"]) {
  if (!source.includes(boundary)) throw new Error(`Deployment package is missing operational boundary: ${boundary}`);
}
for (const statusField of ["raceWindowActive", "raceWindowId", "raceWindowStart", "raceWindowEnd"]) {
  if (!source.includes(statusField)) throw new Error(`Deployment package is missing status field: ${statusField}`);
}
for (const route of ["/api/strava/candidates", "/assign"]) {
  if (!source.includes(route)) throw new Error(`Deployment package is missing admin review route: ${route}`);
}
for (const route of ["/api/strava/public/races", "/api/strava/public/race-status"]) {
  if (!source.includes(route)) throw new Error(`Deployment package is missing public race route: ${route}`);
}
const routesSource = readFileSync(join(root, "lib/routes.mjs"), "utf8");
const adminCheckIndex = routesSource.indexOf("!await authorizedAdmin(request, env)");
const candidateResponseIndex = routesSource.indexOf("if (candidateReview)");
const assignmentResponseIndex = routesSource.indexOf("if (candidateAssignment)");
if (adminCheckIndex < 0 || candidateResponseIndex < 0 || assignmentResponseIndex < 0
  || adminCheckIndex > candidateResponseIndex || adminCheckIndex > assignmentResponseIndex) {
  throw new Error("Candidate administration can be reached before the shared admin authentication check");
}
const seed = readFileSync(join(root, "seeds/001_ggma_2026_race_schedule_mysql.sql"), "utf8");
const seededRaces = [...seed.matchAll(/\('ggma-2026-(\d{2})',\s*'ggma-2026',\s*(\d+),/g)];
if (seededRaces.length !== 50 || new Set(seededRaces.map((match) => Number(match[2]))).size !== 50) {
  throw new Error("Deployment package does not contain exactly 50 unique GGMA schedule rows");
}
for (const migrationName of ["004_ggma_race_schedule_mysql.sql", "004b_ggma_race_schedule_mariadb_repair.sql"]) {
  const migration = readFileSync(join(root, "migrations", migrationName), "utf8");
  if (/GENERATED\s+ALWAYS/i.test(migration) || /included_scheduled_marathon_id\s+VARCHAR/i.test(migration)) {
    throw new Error(`${migrationName} contains the rejected MariaDB generated-column design`);
  }
  if (!/PRIMARY KEY \(scheduled_marathon_id\)/.test(migration)
    || !/UNIQUE KEY strava_race_activity_matches_activity \(activity_id\)/.test(migration)) {
    throw new Error(`${migrationName} does not enforce the one-race/one-activity match relation`);
  }
}
const mysqlStoreSource = readFileSync(join(root, "lib/mysql-store.mjs"), "utf8");
const candidateRuntimeColumns = [
  "activity_id", "athlete_id", "operational_window_id", "activity_start_at",
  "activity_local_date", "activity_type", "distance_meters", "moving_time_seconds",
  "elapsed_time_seconds", "elevation_gain_meters", "summary_polyline", "start_latitude",
  "start_longitude", "end_latitude", "end_longitude", "classification_status",
  "scheduled_marathon_id", "scheduled_state_code", "match_confidence", "match_method",
  "exclusion_reason", "reviewed_at", "reviewed_by", "source_updated_at", "created_at", "updated_at",
];
const candidateMigrationChain = [
  "003_strava_race_activity_candidates_mysql.sql",
  "004b_ggma_race_schedule_mariadb_repair.sql",
  "005_strava_candidate_runtime_fields_mariadb.sql",
].map((name) => readFileSync(join(root, "migrations", name), "utf8")).join("\n");
const declaredCandidateColumns = new Set(
  [...candidateMigrationChain.matchAll(/^\s*(?:ADD COLUMN IF NOT EXISTS\s+)?([a-z][a-z0-9_]*)\s+(?:BIGINT|VARCHAR|CHAR|DATE|DECIMAL|INT|TEXT)\b/gim)]
    .map((match) => match[1]),
);
for (const field of candidateRuntimeColumns) {
  if (!mysqlStoreSource.includes(field)) {
    throw new Error(`MySQL runtime schema contract no longer references candidate field: ${field}`);
  }
  if (!declaredCandidateColumns.has(field)) {
    throw new Error(`Production migration chain does not declare runtime candidate field: ${field}`);
  }
}
const continuationMigration = readFileSync(
  join(root, "migrations/005_strava_candidate_runtime_fields_mariadb.sql"),
  "utf8",
);
for (const field of ["moving_time_seconds", "elapsed_time_seconds", "elevation_gain_meters", "summary_polyline"]) {
  if (!continuationMigration.includes(`ADD COLUMN IF NOT EXISTS ${field}`)) {
    throw new Error(`Candidate runtime continuation migration is missing idempotent field: ${field}`);
  }
}
if (/GENERATED\s+ALWAYS|DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|UPDATE\s+/i.test(continuationMigration)) {
  throw new Error("Candidate runtime continuation migration is not purely additive");
}
for (const predicate of [
  "candidate.classification_status = ?",
  "candidate.scheduled_marathon_id = match_row.scheduled_marathon_id",
  "WHERE schedule.operational_window_id = ?",
]) {
  if (!mysqlStoreSource.includes(predicate)) throw new Error(`Public race query is missing: ${predicate}`);
}
if (/(?:wrangler|Cloudflare Workers|D1 binding|api\.goodwingoodge\.com)/i.test(source)) {
  throw new Error("Deployment package still contains an abandoned Cloudflare runtime assumption");
}
if (/test-only-(?:access|refresh|authorization|client)/.test(source)) {
  throw new Error("Deployment package contains a test credential fixture");
}

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (manifest.main !== "passenger.cjs" || manifest.engines?.node !== "22.x" || manifest.type !== "module") {
  throw new Error("Invalid cPanel package manifest");
}
if (JSON.stringify(Object.keys(manifest.dependencies || {})) !== JSON.stringify(["mysql2"])) {
  throw new Error("The cPanel package dependency set is not minimal");
}

const applicationSource = readFileSync(join(root, "app.js"), "utf8");
const productionStartup = applicationSource.slice(applicationSource.indexOf("export async function startApplication"));
const listenIndex = productionStartup.indexOf("server.listen(port, host)");
if (listenIndex < 0 || listenIndex > productionStartup.indexOf("loadStartupEnvironment(processEnvironment)")
  || listenIndex > productionStartup.indexOf("await import(\"./lib/mysql-store.mjs\")")) {
  throw new Error("Production startup no longer listens before asynchronous initialization");
}

console.log(`cPanel package passed: ${allFiles.length} files, Node 22, one production dependency, routes and migration present.`);
