import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  FOLLOW_ZOOM,
  MAX_NATIVE_ZOOM,
  PREVIEW_TILE_PROVIDER,
  TRACKING_STATE,
  classifyRvLocation,
  createTrackingMap,
  validCoordinate,
} from "./source/tracking-map.mjs";
import {
  MAX_BACKOFF_MS,
  PUBLIC_RACES_ENDPOINT,
  PUBLIC_RACE_STATUS_ENDPOINT,
  PUBLIC_RV_LOCATION_ENDPOINT,
  RV_REFRESH_MS,
  WILL_REFRESH_MS,
  createAdaptivePoller,
  deriveWillLocation,
  loadPublicRvLocation,
  normalizePublicRvLocation,
} from "./source/feeds.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(import.meta.dirname, "dist", "tracking-preview");
const manifest = JSON.parse(readFileSync(join(outputRoot, "asset-manifest.json"), "utf8"));
const readOutput = (path) => readFileSync(join(outputRoot, path), "utf8");
const sha256 = (content) => createHash("sha256").update(content).digest("hex");

function outputFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    return entry.isDirectory() ? outputFiles(join(directory, entry.name), `${relative}/`) : [relative];
  });
}

function asset(name) {
  return manifest.generatedFiles.find((entry) => entry.path.startsWith(`assets/${name}-`));
}

function harness({ reducedMotion = true, width = 320 } = {}) {
  const events = new Map();
  const calls = { map: 0, mapOptions: null, tile: 0, setView: [], flyTo: [], panTo: [], fitBounds: [], markers: [] };
  const buttons = Object.fromEntries(["live", "will", "rv", "route"].map((name) => [name, {
    disabled: false, attrs: {}, listeners: {}, title: "", textContent: "",
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    click() { this.listeners.click(); },
  }]));
  const element = { clientWidth: width };
  const controls = { querySelector(selector) { return buttons[selector.match(/"(live|will|rv|route)"/)[1]]; } };
  let zoom = 3;
  const map = {
    on(name, callback) { events.set(name, callback); },
    setView(point, nextZoom, options) { zoom = Math.min(nextZoom, calls.mapOptions.maxZoom); calls.setView.push({ point, zoom, requestedZoom: nextZoom, options }); },
    flyTo(point, nextZoom, options) { zoom = Math.min(nextZoom, calls.mapOptions.maxZoom); calls.flyTo.push({ point, zoom, requestedZoom: nextZoom, options }); },
    panTo(point, options) { calls.panTo.push({ point, zoom, options }); },
    getZoom() { return zoom; },
    fitBounds(bounds, options) { if (bounds.length === 1) zoom = Math.min(options.maxZoom, calls.mapOptions.maxZoom); calls.fitBounds.push({ bounds, options, zoom }); },
    removeLayer(layer) { layer.removed = true; },
  };
  const L = {
    map(_element, options) { calls.map += 1; calls.mapOptions = options; return map; },
    tileLayer(url, options) { calls.tile += 1; calls.tileUrl = url; calls.tileOptions = options; return { addTo() { return this; } }; },
    latLngBounds(points) { return points; },
    icon(options) { return options; },
    polyline() { return { addTo() { return this; } }; },
    circleMarker() { return { bindTooltip() { return this; }, addTo() { return this; } }; },
    marker(point, options) {
      const marker = {
        point, options,
        setLatLng(next) { this.point = next; },
        setIcon(icon) { this.options.icon = icon; },
        bindPopup(content) { this.popup = content; return this; },
        getPopup() { return this.popup; },
        setPopupContent(content) { this.popup = content; },
        addTo(target) { this.addedTo = target; return this; },
      };
      calls.markers.push(marker);
      return marker;
    },
  };
  const routeStops = [
    { n: 1, lat: 21.3099, lng: -157.8581, city: "Honolulu", state: "Hawaii" },
    { n: 50, lat: 40.7128, lng: -74.006, city: "New York City", state: "New York" },
  ];
  const tracker = createTrackingMap({
    L, element, controls, routeStops, reducedMotion,
    markerAssets: { will: "/tracking-preview/assets/will.png", rv: "/tracking-preview/assets/rv.png" },
  });
  return { tracker, buttons, element, events, calls, routeStops };
}

const freshRv = (lat = 39.966123456, lng = -82.934654321, observedAt = "2026-09-20T12:00:00.000Z") => ({
  available: true, stale: false, observedAt, position: { lat, lng },
});
const staleRv = () => ({ ...freshRv(), stale: true });
const freshWill = (lat = 40.123456789, lng = -82.123456789, observedAt = "2026-09-20T12:00:00.000Z") => ({
  available: true, stale: false, observedAt, position: { lat, lng },
});

test("build output is exact, deterministic, content-versioned, and isolated", () => {
  const files = outputFiles(outputRoot).sort();
  const expected = ["asset-manifest.json", ...manifest.generatedFiles.map((entry) => entry.path)].sort();
  assert.deepEqual(files, expected);
  assert.equal(manifest.prefix, "/tracking-preview");
  for (const entry of manifest.generatedFiles) {
    const bytes = readFileSync(join(outputRoot, entry.path));
    assert.equal(sha256(bytes), entry.sha256);
    if (entry.path.startsWith("assets/")) assert.ok(entry.path.includes(entry.sha256.slice(0, 16)));
    assert.ok(entry.url.startsWith("/tracking-preview/"));
  }
  const first = manifest.generatedFiles.map((entry) => [entry.path, entry.sha256]);
  execFileSync(process.execPath, [join(import.meta.dirname, "build.mjs")], { cwd: repositoryRoot });
  const rebuilt = JSON.parse(readFileSync(join(outputRoot, "asset-manifest.json"), "utf8"));
  assert.deepEqual(rebuilt.generatedFiles.map((entry) => [entry.path, entry.sha256]), first);
});

test("deployment rejects every path outside tracking-preview", () => {
  const deploy = readFileSync(join(import.meta.dirname, "deploy.mjs"), "utf8");
  const workflow = readFileSync(join(repositoryRoot, ".github/workflows/deploy-tracking-preview.yml"), "utf8");
  assert.match(deploy, /refs\/heads\/codex\/tracking-preview-leaflet/);
  assert.match(deploy, /public_html\/tracking-preview\//);
  assert.match(deploy, /destination\.startsWith\(destinationRoot\)/);
  assert.doesNotMatch(deploy, /public_html\/(?:assets|client-preview)\//);
  assert.match(workflow, /branches: \[codex\/tracking-preview-leaflet\]/);
  assert.doesNotMatch(workflow, /deploy-(?:static|backend)-production/);
});

test("public package has no local diagnostics, localhost URLs, secrets, or route escapes", () => {
  const customAssets = [asset("app"), asset("feeds"), asset("tracking-map"), asset("route-data")];
  for (const entry of customAssets) {
    const source = readOutput(entry.path);
    assert.doesNotMatch(source, /localhost|127\.0\.0\.1|console\.(?:log|info|warn|debug)|__[_A-Z]+__/i);
    assert.doesNotMatch(source, /(?:token|password|secret|api[_-]?key)\s*[:=]\s*["'][^"']+/i);
    assert.doesNotMatch(source, /["']\/(?:assets|client-preview)\//);
  }
  const html = readOutput("index.html");
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /canonical|googletagmanager|localhost|127\.0\.0\.1/i);
  assert.match(readOutput(".htaccess"), /X-Robots-Tag "noindex, nofollow"/);
  assert.match(readOutput(".htaccess"), /DirectoryIndex index\.html/);
});

test("OpenStreetMap policy and dark treatment remain compliant", () => {
  const mapSource = readOutput(asset("tracking-map").path);
  const css = readOutput(asset("styles").path);
  assert.equal(PREVIEW_TILE_PROVIDER.url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert.match(mapSource, /detectRetina: false/);
  assert.match(mapSource, /OpenStreetMap contributors/);
  assert.doesNotMatch(mapSource, /prefetch|serviceWorker|caches\.|cache:\s*["']reload|no-referrer/i);
  assert.match(css, /\.tracking-map \.leaflet-tile-pane\{filter:grayscale\(1\) invert\(1\)/);
  assert.match(readOutput(".htaccess"), /https:\/\/tile\.openstreetmap\.org/);
  assert.doesNotMatch(readOutput(".htaccess"), /Referrer-Policy|no-referrer/i);
});

test("planned full-country route loads before feeds and survives feed failures", () => {
  const h = harness();
  assert.equal(h.calls.map, 1);
  assert.equal(h.calls.tile, 1);
  assert.deepEqual(h.calls.fitBounds[0].bounds, h.routeStops.map((stop) => [stop.lat, stop.lng]));
  const appSource = readOutput(asset("app").path);
  assert.ok(appSource.indexOf("createTrackingMap({") < appSource.indexOf("createAdaptivePoller({"));
  assert.match(appSource, /void rvPoller\.start\(\)/);
  assert.match(appSource, /void willPoller\.start\(\)/);
  assert.doesNotMatch(appSource, /await (?:rvPoller|willPoller)\.start/);
});

test("first fresh RV focuses at zoom 10 and later movement pans", () => {
  const h = harness({ reducedMotion: false });
  h.tracker.setRvLocation(freshRv());
  assert.equal(h.tracker.getRvState().kind, TRACKING_STATE.LIVE);
  assert.equal(h.tracker.getFollowing(), "rv");
  assert.equal(h.tracker.isLiveFollowEnabled(), true);
  assert.equal(h.buttons.live.textContent, "Pause Live Follow");
  assert.deepEqual(h.calls.fitBounds.at(-1).bounds, [[39.966123456, -82.934654321]]);
  assert.equal(h.calls.fitBounds.at(-1).options.maxZoom, 10);
  assert.equal(h.calls.fitBounds.at(-1).zoom, 10);
  h.tracker.setRvLocation(freshRv(39.967, -82.935, "2026-09-20T12:01:00.000Z"));
  assert.deepEqual(h.calls.panTo.at(-1).point, [39.967, -82.935]);
  assert.equal(h.calls.panTo.at(-1).zoom, 10);
});

test("first fresh Will focuses at zoom 10", () => {
  const h = harness({ reducedMotion: false });
  h.tracker.setWillLocation(freshWill());
  assert.equal(h.tracker.getFollowing(), "will");
  assert.deepEqual(h.calls.fitBounds.at(-1).bounds, [[40.123456789, -82.123456789]]);
  assert.equal(h.calls.fitBounds.at(-1).options.maxZoom, 10);
  assert.equal(h.calls.fitBounds.at(-1).zoom, 10);
});

test("both fresh subjects are framed together", () => {
  const h = harness();
  h.tracker.setWillLocation(freshWill());
  h.tracker.setRvLocation(freshRv());
  assert.equal(h.tracker.getFollowing(), "both");
  assert.deepEqual(h.calls.fitBounds.at(-1).bounds, [
    [40.123456789, -82.123456789],
    [39.966123456, -82.934654321],
  ]);
  assert.equal(h.calls.fitBounds.at(-1).options.maxZoom, 10);
});

test("stale RV remains as a labeled last-known marker without auto-follow", () => {
  const h = harness();
  h.tracker.setRvLocation(staleRv());
  assert.equal(h.tracker.getRvState().kind, TRACKING_STATE.STALE);
  assert.match(h.tracker.getMarker("rv").options.icon.className, /rv-stale/);
  assert.match(h.tracker.getMarker("rv").popup, /RV last known location.*Location is currently stale/);
  assert.equal(h.buttons.rv.disabled, false);
  assert.equal(h.buttons.rv.textContent, "Show RV Last Known");
  assert.equal(h.tracker.getFollowing(), null);
  const before = h.calls.fitBounds.length;
  h.buttons.rv.click();
  assert.equal(h.calls.fitBounds.length, before + 1);
  assert.equal(h.calls.fitBounds.at(-1).options.maxZoom, FOLLOW_ZOOM);
});

test("unavailable feeds remove their markers and disable controls", () => {
  const h = harness();
  h.tracker.setRvLocation(staleRv());
  h.tracker.setWillLocation(freshWill());
  h.tracker.setRvLocation({ available: false });
  h.tracker.setWillLocation({ available: false });
  assert.equal(h.tracker.getMarker("rv"), null);
  assert.equal(h.tracker.getMarker("will"), null);
  assert.equal(h.buttons.rv.disabled, true);
  assert.equal(h.buttons.will.disabled, true);
  for (const point of [null, { lat: 0, lng: 0 }, { lat: NaN, lng: -83 }, { lat: "39.9", lng: "-83" }]) {
    assert.equal(validCoordinate(point), false);
    assert.equal(classifyRvLocation({ available: true, stale: true, observedAt: "2026-09-20T12:00:00Z", position: point }).kind, TRACKING_STATE.UNAVAILABLE);
  }
});

test("Pause, Resume, and Full Route control automatic camera movement", () => {
  const h = harness();
  h.tracker.setRvLocation(freshRv());
  h.buttons.live.click();
  assert.equal(h.tracker.isLiveFollowEnabled(), false);
  assert.equal(h.buttons.live.textContent, "Resume Live Follow");
  const pausedCount = h.calls.fitBounds.length;
  h.tracker.setRvLocation(freshRv(39.97, -82.94, "2026-09-20T12:02:00Z"));
  assert.equal(h.calls.fitBounds.length, pausedCount);
  h.buttons.live.click();
  assert.equal(h.tracker.isLiveFollowEnabled(), true);
  assert.equal(h.calls.fitBounds.length, pausedCount + 1);
  h.buttons.route.click();
  assert.equal(h.tracker.isLiveFollowEnabled(), false);
  assert.equal(h.tracker.getViewMode(), "route");
  assert.equal(h.calls.fitBounds.at(-1).bounds.length, h.routeStops.length + 1);
});

test("maximum zoom is 10 across map, tiles, direct views, and fits", () => {
  const h = harness();
  assert.equal(MAX_NATIVE_ZOOM, 10);
  assert.equal(FOLLOW_ZOOM, 10);
  assert.equal(h.calls.mapOptions.maxZoom, 10);
  assert.equal(h.calls.mapOptions.bounceAtZoomLimits, false);
  assert.equal(h.calls.tileOptions.maxZoom, 10);
  assert.equal(h.calls.tileOptions.maxNativeZoom, 10);
  assert.equal(h.calls.tileOptions.detectRetina, false);
  h.tracker.map.setView([0, 1], 99, {});
  h.tracker.map.flyTo([1, 2], 99, {});
  assert.equal(h.calls.setView.at(-1).zoom, 10);
  assert.equal(h.calls.flyTo.at(-1).zoom, 10);
});

test("public RV normalization and intended endpoint remain strict", async () => {
  const result = normalizePublicRvLocation(freshRv(), { nowMs: Date.parse("2026-09-20T12:03:00Z") });
  assert.deepEqual(result.position, freshRv().position);
  assert.equal(PUBLIC_RV_LOCATION_ENDPOINT, "/strava/public/tracking-status");
  let request;
  await loadPublicRvLocation({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify(freshRv()), { status: 200, headers: { "content-type": "application/json" } });
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
  });
  assert.equal(request.url, PUBLIC_RV_LOCATION_ENDPOINT);
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.credentials, "omit");
});

test("Will location is derived only from the validated public race feed", () => {
  assert.equal(PUBLIC_RACES_ENDPOINT, "/strava/public/races");
  assert.equal(PUBLIC_RACE_STATUS_ENDPOINT, "/strava/public/race-status");
  const observedAt = "2026-09-20T12:10:00.000Z";
  const snapshot = {
    source: "api",
    races: [{ activity: { startTime: "2026-09-20T12:00:00.000Z", elapsedTimeSeconds: 600, endLatLng: [40.1, -82.2], summaryPolyline: null } }],
  };
  assert.deepEqual(deriveWillLocation(snapshot, { nowMs: Date.parse("2026-09-20T12:15:00Z") }), {
    available: true, stale: false, observedAt, position: { lat: 40.1, lng: -82.2 },
  });
  assert.equal(deriveWillLocation(snapshot, { nowMs: Date.parse("2026-09-20T12:30:01Z") }).stale, true);
  assert.deepEqual(deriveWillLocation({ source: "api", races: [] }), { available: false });
});

test("polling is immediate, non-overlapping, reconnect-aware, and bounded", async () => {
  assert.equal(RV_REFRESH_MS, 30_000);
  assert.equal(WILL_REFRESH_MS, 45_000);
  assert.equal(MAX_BACKOFF_MS, 300_000);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const timers = [];
  const documentObject = {
    hidden: false,
    addEventListener(name, callback) { documentListeners.set(name, callback); },
    removeEventListener(name) { documentListeners.delete(name); },
  };
  const windowObject = {
    addEventListener(name, callback) { windowListeners.set(name, callback); },
    removeEventListener(name) { windowListeners.delete(name); },
  };
  let calls = 0;
  let release;
  const first = new Promise((resolve) => { release = resolve; });
  const poller = createAdaptivePoller({
    intervalMs: RV_REFRESH_MS,
    load: async () => { calls += 1; if (calls === 1) return first; return freshRv(); },
    onData() {}, onFailure() {}, documentObject, windowObject,
    setTimeoutImpl(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutImpl() {},
  });
  const started = poller.start();
  const overlap = poller.refresh();
  await Promise.resolve();
  assert.equal(calls, 1);
  release(freshRv());
  await Promise.all([started, overlap]);
  assert.equal(timers.at(-1).delay, RV_REFRESH_MS);
  windowListeners.get("online")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  poller.destroy();
});

test("polling uses exponential backoff and recovers to the normal interval", async () => {
  const timers = [];
  let calls = 0;
  const poller = createAdaptivePoller({
    intervalMs: RV_REFRESH_MS,
    load: async () => { calls += 1; if (calls < 3) throw new Error("temporary"); return freshRv(); },
    onData() {}, onFailure() {},
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    windowObject: { addEventListener() {}, removeEventListener() {} },
    setTimeoutImpl(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutImpl() {},
  });
  await poller.start();
  assert.equal(timers.at(-1).delay, 60_000);
  timers.at(-1).callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.at(-1).delay, 120_000);
  timers.at(-1).callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.at(-1).delay, 30_000);
  assert.equal(poller.getConsecutiveFailures(), 0);
  poller.destroy();
});

test("mobile, keyboard, and reduced-motion support are present", () => {
  const html = readOutput("index.html");
  const css = readOutput(asset("styles").path);
  const mapSource = readOutput(asset("tracking-map").path);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="group" aria-label="Map view controls"/);
  assert.match(css, /@media\(max-width:380px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(mapSource, /keyboard: true/);
  assert.match(mapSource, /animate: Boolean\(animate && !reducedMotion\)/);
});
