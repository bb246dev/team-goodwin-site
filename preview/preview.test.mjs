import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "preview", "dist");
const routes = [
  "index", "live-tracking", "the-run", "will", "fifty-runs", "updates",
  "faq", "week-1", "week-2", "week-3", "partners", "athletes",
  "privacy", "terms", "participation-terms", "accessibility",
];
const read = (path) => readFileSync(join(output, path), "utf8");

test("every preview page is isolated from search, analytics and production navigation", () => {
  for (const route of routes) {
    const html = read(route === "index" ? "index.html" : `${route}/index.html`);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.doesNotMatch(html, /googletagmanager\.com|gtag\('config'|rel="canonical"/);
    assert.doesNotMatch(html, /href="\/(?:will|the-run|fifty-runs|updates|faq|week-[123]|privacy|terms|participation-terms|accessibility)\//);
    assert.match(html, /data-client-preview-guard/);
  }
});

test("review feed code is loaded only by preview and reads the real public APIs", () => {
  const home = read("index.html");
  const tracker = read("assets/tracker-base.js");
  const raceMap = read("assets/strava-race-map.mjs");
  const productionTracker = readFileSync(join(root, "production-merge/mission-window-alignment-2026-09-09/public_html/assets/tracker-base.js"), "utf8");
  const productionMap = readFileSync(join(root, "production-merge/mission-window-alignment-2026-09-09/public_html/assets/strava-race-map.mjs"), "utf8");
  assert.match(home, /src="\/client-preview\/assets\/tracker-base\.js"/);
  assert.match(home, /data-preview-feed="rv"/);
  assert.match(home, /data-preview-feed="will"/);
  assert.match(tracker, /import\("\/client-preview\/assets\/strava-race-map\.mjs"\)/);
  assert.match(tracker, /if \(missionHapnLivePosition\) appendImageMarker/);
  assert.doesNotMatch(tracker, /appendImageMarker\(svg, svgNS, runnerPoint/);
  assert.match(raceMap, /"\/strava\/public\/tracking-status"/);
  assert.match(raceMap, /"\/strava\/public\/races"/);
  assert.match(raceMap, /"\/strava\/public\/race-status"/);
  assert.match(productionMap, /raceStatus\.active === true/);
  assert.match(productionTracker, /if \(snapshot\?\.source === "api" && snapshot\.status\.active/);
});
