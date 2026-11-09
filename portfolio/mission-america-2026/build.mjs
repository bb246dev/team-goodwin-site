#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(projectDir, "../..");
const outputRoot = join(projectDir, "dist");
const archivePrefix = "/portfolio/mission-america-2026/";
const productionCommit = "6b2949dfcf3e3b70957d6e5fbb61f8d0ae81abb5";

const pages = new Map([
  ["", "mission-clock-final-release-2026-11-02-index.html"],
  ["live-tracking", "mission-clock-final-release-2026-11-02-live-tracking.html"],
  ["the-run", "sponsor-release-2026-10-04-the-run.html"],
  ["will", "sponsor-release-2026-10-04-will.html"],
  ["fifty-runs", "sponsor-release-2026-10-04-fifty-runs.html"],
  ["week-1", "sponsor-release-2026-10-04-week-1.html"],
  ["week-2", "sponsor-release-2026-10-04-week-2.html"],
  ["week-3", "sponsor-release-2026-10-04-week-3.html"],
  ["faq", "sponsor-release-2026-10-04-faq.html"],
  ["updates", "sponsor-release-2026-10-04-updates.html"],
  ["privacy", "sponsor-release-2026-10-04-privacy.html"],
  ["terms", "sponsor-release-2026-10-04-terms.html"],
  ["participation-terms", "sponsor-release-2026-10-04-participation-terms.html"],
  ["accessibility", "sponsor-release-2026-10-04-accessibility.html"],
  ["athletes", "sponsor-release-2026-10-04-athletes.html"],
  ["partners", "sponsor-release-2026-10-04-partners.html"],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function write(relativePath, contents) {
  const destination = join(outputRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function copyDirectory(source, destination, filter = () => true) {
  cpSync(source, destination, { recursive: true, filter });
}

function stripAnalytics(html) {
  return html
    .replace(/\s*<script[^>]+src=["']https:\/\/www\.googletagmanager\.com\/gtag\/js[^>]*><\/script>/gi, "")
    .replace(/\s*<script>\s*window\.dataLayer[\s\S]*?gtag\(['\"]config['\"][\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*id=["']\$tsr-stream-barrier["'][\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*>\s*import\(["']\/assets\/index-[^"']+\.js["']\)\s*<\/script>/gi, "");
}

function archiveForms(html) {
  return html.replace(/<form\b[\s\S]*?<\/form>/gi, '<div class="mission-archive-notice" data-archive-form role="note"><strong>Archived event.</strong> Signups and participation forms are closed. This portfolio copy does not submit or store information.</div>');
}

function rewritePaths(html) {
  return html
    .replace(/https:\/\/(?:www\.)?goodwingoodge\.com\//gi, archivePrefix)
    .replace(/(["'(=])\.\.\/assets\//g, `$1${archivePrefix}assets/`)
    .replace(/(["'(=])\.\.\/fonts\//g, `$1${archivePrefix}fonts/`)
    .replace(/((?:href|src|poster|content)=["'])\/(?!\/|portfolio\/mission-america-2026\/)/gi, `$1${archivePrefix}`)
    .replace(/url\((['"]?)\/(?!\/)/gi, `url($1${archivePrefix}`)
    .replace(/(["'])\/(?:api\/instagram-feed)(["'])/g, `$1${archivePrefix}data/instagram-feed-disabled.json$2`);
}

function addArchiveShell(html, route) {
  const base = `<base href="${archivePrefix}">`;
  const robots = '<meta name="robots" content="noindex, nofollow, noarchive"><meta name="googlebot" content="noindex, nofollow, noarchive">';
  const assets = `<link rel="stylesheet" href="${archivePrefix}archive.css"><script defer src="${archivePrefix}archive-runtime.js"></script>`;
  const canonical = `<link rel="canonical" href="https://www.goodwingoodge.com${archivePrefix}${route ? `${route}/` : ""}">`;
  let output = html.replace(/<base\b[^>]*>/i, "");
  output = output.replace(/<link\s+rel=["']canonical["'][^>]*>/i, canonical);
  if (!output.includes(canonical)) output = output.replace("</head>", `${canonical}</head>`);
  output = output.replace(/<head>/i, `<head>${base}${robots}${assets}`);
  const banner = `<div class="mission-archive-banner" role="note"><strong>Mission America 2026 archive</strong><span>Recorded portfolio snapshot · live tracking and submissions are disabled</span></div>`;
  return output.replace(/<body([^>]*)>/i, `<body$1 data-archive-route="${route || "home"}">${banner}`);
}

function addHistoricalMapNotice(html) {
  const notice = '<div class="mission-archive-notice" id="archived-event" role="note"><strong>Archived route snapshot.</strong> Captured November 9, 2026 from the public race feed: 27 of 50 races had recorded activities. The remaining history was not publicly available and is not inferred. Map controls remain interactive; live GPS, authenticated APIs, and production polling are disabled.</div>';
  return html
    .replace("<div class=\"tracker-map-stage\"", `${notice}<div class="tracker-map-stage"`)
    .replace("<div class=\"tracker-eyebrow\">LIVE MAP</div>", '<div class="tracker-eyebrow">ARCHIVED MAP</div>')
    .replace("<h2>Follow in Real Time</h2>", "<h2>Explore the Recorded Route</h2>");
}

function transformPage(source, route) {
  let html = readFileSync(source, "utf8").replaceAll("\0", "");
  html = stripAnalytics(html);
  html = archiveForms(html);
  html = rewritePaths(html);
  html = addArchiveShell(html, route);
  if (route === "" || route === "live-tracking") html = addHistoricalMapNotice(html);
  if (route === "will") html = html.replace("loadWillInstagram();", "renderWillInstagram(fallbackInstagram);");
  return html;
}

function patchRaceMap() {
  const source = readFileSync(join(repoRoot, "assets/strava-race-map.mjs"), "utf8")
    .replace('export const PUBLIC_RACES_ENDPOINT = "/strava/public/races";', `export const PUBLIC_RACES_ENDPOINT = "${archivePrefix}data/races.json";`)
    .replace('export const PUBLIC_RACE_STATUS_ENDPOINT = "/strava/public/race-status";', `export const PUBLIC_RACE_STATUS_ENDPOINT = "${archivePrefix}data/race-status.json";`)
    .replace('export const PUBLIC_RV_LOCATION_ENDPOINT = "/strava/public/tracking-status";', `export const PUBLIC_RV_LOCATION_ENDPOINT = "${archivePrefix}data/tracking-status.json";`);
  write("assets/strava-race-map.mjs", source);
}

function patchTracker() {
  let source = readFileSync(join(repoRoot, "assets/releases/mission-clock-final-2026-11-02/tracker-base.js"), "utf8");
  source = source
    .replace('endpoint: "https://docs.google.com/spreadsheets/d/1o6AH6YNdbc0_WkhAvBG96Vv0KglEpoPPzFtce92zlqc/gviz/tq",', `endpoint: "${archivePrefix}data/updates.json",`)
    .replace('const STRAVA_RACE_MODULE_URL = "/assets/strava-race-map.mjs?v=20261029rsvp-map-schedule";', `const STRAVA_RACE_MODULE_URL = "${archivePrefix}assets/strava-race-map.mjs";`)
    .replace('const RV_LOCATION_ENDPOINT = "/strava/public/tracking-status";', `const RV_LOCATION_ENDPOINT = "${archivePrefix}data/tracking-status.json";`)
    .replace('const JOURNEY_STATE_ENDPOINT = "/strava/public/journey-state";', `const JOURNEY_STATE_ENDPOINT = "${archivePrefix}data/journey-state.json";`)
    .replace('const RUN_WITH_WILL_FORM_URL = "https://tally.so/r/lbE0jN";', 'const RUN_WITH_WILL_FORM_URL = "#archived-event";')
    .replace(/async function loadSheetUpdates\(\{ bypassCache = false \} = \{\}\) \{[\s\S]*?\n    \}/, `async function loadSheetUpdates() {\n      const response = await fetch("${archivePrefix}data/updates.json", { headers: { Accept: "application/json" } });\n      if (!response.ok) throw new Error("Archived updates unavailable");\n      const payload = await response.json();\n      return (payload.updates || []).map((update, index) => ({ ...update, dateTime: [update.date, update.time].filter(Boolean).join(" | "), sortValue: index * -1, sourceIndex: index }));\n    }`)
    .replace(/\n    window\.setInterval\(\(\) => loadTickerUpdates\(\{ bypassCache: true \}\), missionUpdatesSheet\.cacheMs\);/, "")
    .replace('if (!stopped && !documentObject?.hidden) timer = setTimeoutImpl(() => { void refresh(); }, intervalMs);', '/* Archived snapshot: intentionally no recurring journey polling. */')
    .replace(/const garminPromise = import\(GARMIN_KML_MODULE_URL\)[\s\S]*?\n\s*\.catch\(\(\) => \{[\s\S]*?\n\s*\}\);/, 'const garminPromise = Promise.resolve(null);\n        setMissionGarminLocation(null, "archived");');
  if (source.includes("/strava/public/") || source.includes("/tracking-preview/garmin-feed")) {
    throw new Error("Archive tracker still contains a production tracking endpoint");
  }
  write("assets/tracker-base.js", source);
}

function patchAmbientPages() {
  const path = join(outputRoot, "assets/ambient-pages.js");
  let source = readFileSync(path, "utf8");
  source = source.replace(
    /(  const trackerNav = document\.querySelector\("\.tracker-nav"\);\n  const trackerMenuToggle = document\.querySelector\("\.tracker-menu-toggle"\);)\n  if \(trackerNav && trackerMenuToggle\) \{[\s\S]*?\n  \}\n\n  if \(trackerNav\)/,
    "$1\n\n  if (trackerNav)",
  );
  write("assets/ambient-pages.js", source);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

copyDirectory(join(repoRoot, "assets"), join(outputRoot, "assets"), (source) => {
  const rel = relative(join(repoRoot, "assets"), source).replaceAll("\\", "/");
  return !rel.startsWith("releases/") && !rel.startsWith("main-site-map-airport-overrides-2026-09-29/");
});
copyDirectory(join(repoRoot, "fonts"), join(outputRoot, "fonts"));
for (const name of readdirSync(join(projectDir, "production-assets"))) {
  if (name.endsWith(".md") || name.endsWith("manifest.json")) continue;
  cpSync(join(projectDir, "production-assets", name), join(outputRoot, "assets", name));
}
copyDirectory(join(projectDir, "snapshots"), join(outputRoot, "data"), (source) => !source.endsWith("snapshot-manifest.json"));
cpSync(join(repoRoot, "assets/ticker-updates.json"), join(outputRoot, "data/updates.json"));
write("data/instagram-feed-disabled.json", "{\n  \"data\": []\n}\n");
cpSync(join(projectDir, "archive.css"), join(outputRoot, "archive.css"));
cpSync(join(projectDir, "archive-runtime.js"), join(outputRoot, "archive-runtime.js"));

for (const [route, sourceName] of pages) {
  const html = transformPage(join(repoRoot, sourceName), route);
  write(route ? `${route}/index.html` : "index.html", html);
  if (route === "live-tracking") write("live-tracking.html", html);
}

patchRaceMap();
patchTracker();
patchAmbientPages();

write(".htaccess", `Options -Indexes\nDirectoryIndex index.html\nRewriteEngine Off\n<IfModule mod_headers.c>\n  Header always set X-Robots-Tag "noindex, nofollow, noarchive"\n  Header always set X-Content-Type-Options "nosniff"\n  Header always set Referrer-Policy "strict-origin-when-cross-origin"\n</IfModule>\n`);

const inventory = walk(outputRoot)
  .filter((file) => !file.endsWith("deployment-inventory.json"))
  .map((file) => {
    const contents = readFileSync(file);
    return {
      path: relative(outputRoot, file).replaceAll("\\", "/"),
      sha256: sha256(contents),
      bytes: statSync(file).size,
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

write("deployment-inventory.json", `${JSON.stringify({
  schemaVersion: 1,
  archivePrefix,
  productionCommit,
  generatedAt: new Date().toISOString(),
  files: inventory,
}, null, 2)}\n`);

console.log(`Built Mission America portfolio archive: ${inventory.length} files`);
