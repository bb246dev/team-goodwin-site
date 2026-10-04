import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createPublicRvPoller, HAPN_REFRESH_MS, normalizePublicRvLocation } from "../assets/releases/rv-last-known-2026-09-17/strava-race-map.mjs";

const tracker = readFileSync(new URL("../assets/releases/rv-last-known-2026-09-17/tracker-base.js", import.meta.url), "utf8");

function functionBlock(start, end) {
  const from = tracker.indexOf(start);
  const to = tracker.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Expected live SVG map block: ${start}`);
  return tracker.slice(from, to);
}

function rvStateHarness() {
  let notice = null;
  let renders = 0;
  const document = {
    getElementById: (id) => id === "mission-rv-location-status" ? notice : null,
    createElement: () => ({
      setAttribute() {},
      remove() { notice = null; },
    }),
    querySelector: () => ({ insertAdjacentElement(_where, element) { notice = element; } }),
  };
  const create = new Function("document", "renderMissionMap", `
    let missionHapnRv = { kind: "unqueried", position: null, observedAt: null };
    const missionMapTopology = {};
    ${functionBlock("    function validMissionRvFix", "    const pageNowMs")}
    return { validMissionRvFix, setMissionHapnLocation, getState: () => missionHapnRv };
  `);
  const live = create(document, () => { renders += 1; });
  return { ...live, getNotice: () => notice?.textContent, getRenders: () => renders };
}

const fresh = {
  available: true, stale: false, observedAt: "2026-09-17T18:26:09.000Z",
  position: { lat: 39.966123456, lng: -82.934654321 },
};
const stale = { ...fresh, stale: true };

test("fresh RV fix uses its exact coordinate and keeps the normal marker state", () => {
  const view = rvStateHarness();
  view.setMissionHapnLocation(fresh);
  assert.deepEqual(view.getState(), {
    kind: "fresh", position: fresh.position, observedAt: fresh.observedAt,
  });
  assert.equal(view.getNotice(), undefined);
  assert.equal(view.getRenders(), 1);
});

test("valid stale fix remains a last-known coordinate with visible timestamp wording", () => {
  const view = rvStateHarness();
  view.setMissionHapnLocation(stale);
  assert.deepEqual(view.getState(), {
    kind: "stale", position: fresh.position, observedAt: fresh.observedAt,
  });
  assert.match(view.getNotice(), /^RV last known location\. Last updated /);
  assert.match(view.getNotice(), /Location is currently stale\.$/);
  assert.equal(view.getRenders(), 1);
  view.setMissionHapnLocation(stale);
  assert.equal(view.getRenders(), 1, "unchanged polling data must not recreate the map");
});

test("missing, zero, null and invalid RV fixes never receive a marker position", () => {
  const view = rvStateHarness();
  for (const value of [
    { available: false }, null,
    { ...fresh, position: { lat: 0, lng: -82.934 } },
    { ...fresh, position: { lat: 39.966, lng: null } },
    { ...fresh, position: { lat: NaN, lng: -82.934 } },
    { ...fresh, observedAt: "invalid" },
  ]) assert.equal(view.validMissionRvFix(value), null);
  view.setMissionHapnLocation({ available: false });
  assert.deepEqual(view.getState(), { kind: "unavailable", position: null, observedAt: null });
  assert.equal(view.getNotice(), "RV location currently unavailable.");
  assert.match(tracker, /appendImageMarker\(svg, svgNS, rvSvgPoint, mapEntityAssets\.rv, "rv"\)/);
  assert.doesNotMatch(tracker, /appendImageMarker\(svg, svgNS, displayedRvPoint, mapEntityAssets\.rv, "rv"\)/);
});

test("stale to fresh transition restores normal RV state and removes stale notice", () => {
  const view = rvStateHarness();
  view.setMissionHapnLocation(stale);
  view.setMissionHapnLocation({ ...fresh, position: { lat: 40.000000123, lng: -83.000000456 } });
  assert.equal(view.getState().kind, "fresh");
  assert.deepEqual(view.getState().position, { lat: 40.000000123, lng: -83.000000456 });
  assert.equal(view.getNotice(), undefined);
  assert.equal(view.getRenders(), 2);
});

test("stale RV uses the original live icon dimensions and a badge within its frame", () => {
  const document = {
    createElementNS(_namespace, tagName) {
      const attributes = new Map();
      const element = {
        tagName, children: [], style: {}, classList: { add() {} },
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name); },
        append(child) { this.children.push(child); },
        appendChild(child) { this.children.push(child); },
        querySelector(name) { return this.children.find((child) => child.tagName === name); },
      };
      return element;
    },
  };
  const renderMarker = new Function("document", "svg", "svgNS", "rvSvgPoint", "mapEntityAssets", "missionHapnRv", `
    ${functionBlock("    function appendImageMarker", "    function mapViewBoxWithRv")}
    ${functionBlock('      const rvMarker = appendImageMarker(svg, svgNS, rvSvgPoint, mapEntityAssets.rv, "rv");', '      appendImageMarker(svg, svgNS, runnerPoint, mapEntityAssets.runner, "runner");')}
    return rvMarker;
  `);
  const svg = { appendChild() {} };
  const markerFor = (kind) => renderMarker(document, svg, "http://www.w3.org/2000/svg", [100, 200], { rv: "rv.svg" }, { kind });
  const freshMarker = markerFor("fresh");
  const staleMarker = markerFor("stale");
  const iconFrame = (marker) => {
    const image = marker.querySelector("image");
    return ["x", "y", "width", "height"].map((key) => Number(image.getAttribute(key)));
  };
  assert.deepEqual(iconFrame(freshMarker), [-30, -20, 60, 40]);
  assert.deepEqual(iconFrame(staleMarker), iconFrame(freshMarker));
  const badge = staleMarker.querySelector("circle");
  assert.ok(badge, "stale marker retains a compact status badge");
  const cx = Number(badge.getAttribute("cx"));
  const cy = Number(badge.getAttribute("cy"));
  const radius = Number(badge.getAttribute("r")) + Number(badge.getAttribute("stroke-width")) / 2;
  assert.ok(cx - radius >= -30 && cx + radius <= 30);
  assert.ok(cy - radius >= -20 && cy + radius <= 20);
  assert.ok(radius * 2 < 20, "badge stays subordinate to the RV icon");
  assert.equal(freshMarker.querySelector("circle"), undefined);
});

test("full SVG map bounds include the stale RV coordinate", () => {
  const create = new Function(`${functionBlock("    function mapViewBoxWithRv", "    function updateTrackingMapKeyTerminology")}; return mapViewBoxWithRv;`);
  const mapViewBoxWithRv = create();
  const base = mapViewBoxWithRv([0, 0, 100, 100], null);
  const withRv = mapViewBoxWithRv([0, 0, 100, 100], [300, -80]);
  assert.deepEqual(base, { x: -116, y: -18, width: 260, height: 156 });
  assert.ok(withRv.x <= 300 && withRv.x + withRv.width >= 300);
  assert.ok(withRv.y <= -80 && withRv.y + withRv.height >= -80);
  assert.match(tracker, /mapViewBoxWithRv\(topo\.bbox, rvSvgPoint\)/);
});

test("replacing the SVG after a GPS update preserves a visitor-chosen viewport", () => {
  const create = new Function(`${functionBlock("    function startingMapViewBox", "    function updateTrackingMapKeyTerminology")}; return startingMapViewBox;`);
  const startingMapViewBox = create();
  const initial = { x: 0, y: 0, width: 100, height: 80 };
  const chosen = [23.125, 14.875, 45.25, 32.5];
  assert.deepEqual(startingMapViewBox(initial, chosen), { x: 23.125, y: 14.875, width: 45.25, height: 32.5 });
  assert.deepEqual(startingMapViewBox(initial, [0, 0, 0, 40]), initial);
  assert.match(tracker, /startingMapViewBox\(initialViewBox, previousViewBox\)/);
});

test("poller emits stale, fresh and unavailable distinctly without changing its cadence", async () => {
  const events = [];
  const queue = [fresh, stale, { available: false }, fresh];
  let scheduled = 0;
  const poller = createPublicRvPoller({
    load: async () => queue.shift(),
    onPosition: (position, result) => events.push(["fresh", position, result.observedAt]),
    onStale: (result) => events.push(["stale", result.position, result.observedAt]),
    onFallback: () => events.push(["unavailable"]),
    isEnabled: () => true,
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl: (_callback, interval) => { scheduled = interval; return 1; },
    clearTimeoutImpl() {},
  });
  await poller.start();
  await poller.refresh();
  await poller.refresh();
  await poller.refresh();
  poller.destroy();
  assert.deepEqual(events.map(([kind]) => kind), ["fresh", "stale", "unavailable", "fresh"]);
  assert.deepEqual(events[1][1], fresh.position);
  assert.equal(events[1][2], fresh.observedAt);
  assert.equal(scheduled, HAPN_REFRESH_MS);
});

test("public response validation rejects zero and null coordinates", () => {
  for (const position of [{ lat: 0, lng: -82.934 }, { lat: null, lng: -82.934 }, { lat: 39.966, lng: 0 }]) {
    assert.throws(() => normalizePublicRvLocation({ ...fresh, position }, { nowMs: Date.parse(fresh.observedAt) }), /invalid_rv_location/);
  }
});
