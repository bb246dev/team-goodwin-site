import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "preview", "dist");
const routes = [
  "index", "live-tracking", "the-run", "will", "fifty-runs", "updates",
  "faq", "week-1", "week-2", "week-3", "partners", "athletes",
  "privacy", "terms", "participation-terms", "accessibility",
];
const read = (path) => readFileSync(join(output, path), "utf8");
const tracker = read("assets/tracker-base.js");
const { createPublicRvPoller, hapnLivePositioningEnabled } = await import("./dist/assets/strava-race-map.mjs");

function trackerBlock(start, end) {
  const from = tracker.indexOf(start);
  const to = tracker.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Expected preview SVG map block: ${start}`);
  return tracker.slice(from, to);
}

const freshRv = {
  available: true, stale: false, observedAt: "2026-09-18T00:29:04.000Z",
  position: { lat: 39.966123456, lng: -82.934654321 },
};
const staleRv = { ...freshRv, stale: true };

function rvStateHarness() {
  let notice = null;
  let renders = 0;
  const document = {
    getElementById: (id) => id === "mission-rv-location-status" ? notice : null,
    createElement: () => ({ setAttribute() {}, remove() { notice = null; } }),
    querySelector: () => ({ insertAdjacentElement(_where, element) { notice = element; } }),
  };
  const create = new Function("document", "renderMissionMap", `
    let missionHapnRv = { kind: "unqueried", position: null, observedAt: null };
    const missionMapTopology = {};
    ${trackerBlock("    function validMissionRvFix", "    const pageNowMs")}
    return { setMissionHapnLocation, getState: () => missionHapnRv };
  `);
  const view = create(document, () => { renders += 1; });
  return { ...view, getNotice: () => notice?.textContent, getRenders: () => renders };
}

test("preview deployment inventory stays inside the client-preview directory", () => {
  const files = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) visit(join(directory, entry.name), `${relative}/`);
      else files.push(relative);
    }
  };
  visit(output);
  const expected = [
    ".htaccess", "assets/tracker-base.js", "assets/strava-race-map.mjs",
    ...routes.map((route) => route === "index" ? "index.html" : `${route}/index.html`),
  ];
  assert.deepEqual(files.sort(), expected.sort());
  const deploy = readFileSync(join(root, "preview/deploy.mjs"), "utf8");
  assert.match(deploy, /refs\/heads\/client-preview-open-feeds/);
  assert.match(deploy, /public_html\/client-preview\/\$\{file\}/);
  assert.doesNotMatch(deploy, /public_html\/assets\/|public_html\/index\.html/);
});

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
  const raceMap = read("assets/strava-race-map.mjs");
  const productionTracker = readFileSync(join(root, "production-merge/mission-window-alignment-2026-09-09/public_html/assets/tracker-base.js"), "utf8");
  const productionMap = readFileSync(join(root, "production-merge/mission-window-alignment-2026-09-09/public_html/assets/strava-race-map.mjs"), "utf8");
  assert.match(home, /src="\/client-preview\/assets\/tracker-base\.js"/);
  assert.match(home, /data-preview-feed="rv"/);
  assert.match(home, /data-preview-feed="will"/);
  assert.match(tracker, /import\("\/client-preview\/assets\/strava-race-map\.mjs"\)/);
  assert.ok(tracker.includes('const rvMarker = appendImageMarker(svg, svgNS, rvSvgPoint, mapEntityAssets.rv, "rv");'));
  assert.ok(tracker.includes('onStale: setMissionHapnLocation'));
  assert.doesNotMatch(tracker, /missionHapnLivePosition|leaflet|OpenStreetMap|CARTO/i);
  assert.doesNotMatch(tracker, /appendImageMarker\(svg, svgNS, runnerPoint/);
  assert.ok(tracker.includes("RV last known location"));
  assert.match(home, /last-known RV positions/);
  assert.match(raceMap, /"\/strava\/public\/tracking-status"/);
  assert.match(raceMap, /"\/strava\/public\/races"/);
  assert.match(raceMap, /"\/strava\/public\/race-status"/);
  assert.match(raceMap, /hapnLivePositioningEnabled\(\) \{ return true; \}/);
  assert.match(productionMap, /raceStatus\.active === true/);
  assert.match(productionTracker, /if \(snapshot\?\.source === "api" && snapshot\.status\.active/);
});

test("preview keeps the open RV feed and distinguishes fresh, stale and absent fixes", async () => {
  assert.equal(hapnLivePositioningEnabled(), true);
  const events = [];
  const queue = [freshRv, staleRv, { available: false }, freshRv];
  const poller = createPublicRvPoller({
    load: async () => queue.shift(),
    onPosition: (position, result) => events.push(["fresh", position, result.observedAt]),
    onStale: (result) => events.push(["stale", result.position, result.observedAt]),
    onFallback: () => events.push(["unavailable"]),
    isEnabled: () => true,
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
  });
  await poller.start();
  await poller.refresh();
  await poller.refresh();
  await poller.refresh();
  poller.destroy();
  assert.deepEqual(events.map(([kind]) => kind), ["fresh", "stale", "unavailable", "fresh"]);
  assert.deepEqual(events[1][1], freshRv.position);
});

test("preview displays an exact stale RV fix, then restores fresh styling", () => {
  const view = rvStateHarness();
  view.setMissionHapnLocation(staleRv);
  assert.deepEqual(view.getState(), { kind: "stale", position: freshRv.position, observedAt: freshRv.observedAt });
  assert.match(view.getNotice(), /^RV last known location\. Last updated /);
  assert.match(view.getNotice(), /Location is currently stale\.$/);
  view.setMissionHapnLocation({ ...freshRv, position: { lat: 40.000000123, lng: -83.000000456 } });
  assert.equal(view.getState().kind, "fresh");
  assert.equal(view.getNotice(), undefined);
  assert.equal(view.getRenders(), 2);
  view.setMissionHapnLocation({ available: false });
  assert.deepEqual(view.getState(), { kind: "unavailable", position: null, observedAt: null });
  assert.equal(view.getNotice(), "RV location currently unavailable.");
  view.setMissionHapnLocation({ ...freshRv, position: { lat: 0, lng: -82.934 } });
  assert.equal(view.getState().position, null);
});

test("stale RV marker keeps the approved size and belongs in Full Route bounds", () => {
  const createBounds = new Function(`${trackerBlock("    function mapViewBoxWithRv", "    function updateTrackingMapKeyTerminology")}; return mapViewBoxWithRv;`);
  const bounds = createBounds()([0, 0, 100, 100], [300, -80]);
  assert.ok(bounds.x <= 300 && bounds.x + bounds.width >= 300);
  assert.ok(bounds.y <= -80 && bounds.y + bounds.height >= -80);
  assert.ok(tracker.includes("mapViewBoxWithRv(topo.bbox, rvSvgPoint)"));
  assert.ok(tracker.includes('rvMarker.classList.add("is-stale")'));
  assert.ok(tracker.includes('staleBadge.setAttribute("r", "6")'));
  assert.ok(tracker.includes('staleBadge.setAttribute("cx", "22")'));
  assert.ok(tracker.includes('staleBadge.setAttribute("cy", "-12")'));
  assert.ok(tracker.includes('{ x: -30, y: -20, width: 60, height: 40 }'));
  assert.doesNotMatch(trackerBlock('      if (rvMarker && missionHapnRv.kind === "stale")', '      // A race result is not a current runner coordinate;'), /image\.setAttribute\("(?:x|y|width|height)"/);
});
