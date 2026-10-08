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
  raceStopTooltip,
  validCoordinate,
} from "./source/tracking-map.mjs";
import {
  STATIC_PLACEMENTS,
  resolveScheduledLocation,
  MAX_BACKOFF_MS,
  PUBLIC_RV_LOCATION_ENDPOINT,
  RV_REFRESH_MS,
  createAdaptivePoller,
  loadPublicRvLocation,
  normalizePublicRvLocation,
} from "./source/feeds.mjs";
import {
  GARMIN_LOADER_URL,
  GARMIN_MIN_REFRESH_MS,
  GARMIN_PROXY_ENDPOINT,
  allowedGarminFeedUrl,
  loadGarminRunnerLocation,
  parseGarminFeed,
  parseGarminNetworkLink,
  resolveGarminDisplayLocation,
} from "./source/garmin-kml.mjs";
import { ROUTE_STOPS } from "./source/route-data.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(import.meta.dirname, "dist", "tracking-preview");
const manifest = JSON.parse(readFileSync(join(outputRoot, "asset-manifest.json"), "utf8"));
const readOutput = (path) => readFileSync(join(outputRoot, path), "utf8");
const readFixture = (path) => readFileSync(join(import.meta.dirname, "test-fixtures", path), "utf8");
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

function harness({ reducedMotion = true, width = 320, inputRouteStops = null, followLabels, autoFollowSubject = null } = {}) {
  const events = new Map();
  const calls = { map: 0, mapOptions: null, tile: 0, setView: [], flyTo: [], panTo: [], fitBounds: [], markers: [], polylines: [] };
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
    polyline(points, options) {
      const polyline = { points, options, addTo(target) { this.addedTo = target; return this; } };
      calls.polylines.push(polyline);
      return polyline;
    },
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
  const routeStops = inputRouteStops || [
    { n: 1, lat: 21.3099, lng: -157.8581, city: "Honolulu", state: "Hawaii" },
    { n: 50, lat: 40.7128, lng: -74.006, city: "New York City", state: "New York" },
  ];
  const tracker = createTrackingMap({
    L, element, controls, routeStops, reducedMotion,
    markerAssets: { will: "/tracking-preview/assets/will.png", rv: "/tracking-preview/assets/rv.png" },
    followLabels,
    autoFollowSubject,
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
  assert.equal(manifest.productionSource.url, "https://goodwingoodge.com/");
  assert.equal(manifest.productionSource.sha256, sha256(readFileSync(join(import.meta.dirname, "source", "index.html"))));
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
  assert.doesNotMatch(deploy, /public_html\/(?:assets|client-preview|tracking-preview\/site)\//);
  assert.match(workflow, /branches: \[codex\/tracking-preview-leaflet\]/);
  assert.doesNotMatch(workflow, /deploy-(?:static|backend)-production/);
});

test("preview build and upload inventory prohibit copied production site trees", () => {
  const files = outputFiles(outputRoot);
  const html = readOutput("index.html");
  const deploy = readFileSync(join(import.meta.dirname, "deploy.mjs"), "utf8");
  assert.ok(files.every((path) => !path.startsWith("site/")));
  assert.ok(manifest.generatedFiles.every(({ path, url }) => !path.startsWith("site/") && !url.includes("/tracking-preview/site/")));
  assert.doesNotMatch(html, /\/tracking-preview\/site\//);
  assert.match(html, /(?:href|src|poster|data-src)="\/(?:assets|fonts)\//);
  assert.doesNotMatch(deploy, /allowedProductionAsset|site\\\//);
});

test("public package has no local diagnostics, localhost URLs, secrets, or route escapes", () => {
  const customAssets = [asset("app"), asset("feeds"), asset("garmin-kml"), asset("tracking-map"), asset("route-data")];
  for (const entry of customAssets) {
    const source = readOutput(entry.path);
    assert.doesNotMatch(source, /localhost|127\.0\.0\.1|console\.(?:log|info|warn|debug)|__[_A-Z]+__/i);
    assert.doesNotMatch(source, /(?:token|password|secret|api[_-]?key)\s*[:=]\s*["'][^"']+/i);
    assert.doesNotMatch(source, /["']\/(?:assets|client-preview)\//);
  }
  const html = readOutput("index.html");
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /canonical|googletagmanager|localhost|127\.0\.0\.1/i);
  assert.doesNotMatch(html, /(?:href|src|poster|data-src)=["']\.\.\/(?:assets|fonts)\//);
  assert.doesNotMatch(html, /\/tracking-preview\/site\//);
  assert.match(html, /src="\/assets\/tracker-base\.js\?v=/);
  assert.match(readOutput(".htaccess"), /X-Robots-Tag "noindex, nofollow"/);
  assert.match(readOutput(".htaccess"), /DirectoryIndex index\.html/);
});

test("preview duplicates the complete current production homepage and replaces only its map stage", () => {
  const html = readOutput("index.html");
  const orderedMarkers = ['id="live"', 'id="the-run"', 'id="map"', 'id="updates"', 'id="articles"', 'id="why"', 'id="rsvp"', 'class="site-footer"'];
  let previous = -1;
  for (const marker of orderedMarkers) {
    const next = html.indexOf(marker);
    assert.ok(next > previous, `${marker} must remain in production order`);
    previous = next;
  }
  assert.match(html, /class="tracker-nav"/);
  assert.match(html, /class="tracker-hero-bg"[^>]*autoplay[^>]*poster="\/assets\/hero-video-first-frame\.jpg"/);
  assert.match(html, /data-src="\/assets\/hero-signal-optimized\.mp4"/);
  assert.match(html, /class="follow-form"/);
  assert.equal((html.match(/class="inside-accordion-trigger"/g) || []).length, 6);
  assert.match(html, /class="site-footer-partners"/);
  assert.match(html, /id="tracking-map"/);
  assert.doesNotMatch(html, /id="mission-map"/);
  assert.match(html, /data-feed="rv"/);
  assert.match(html, /data-feed="will"/);
  assert.match(html, /<body data-runner-source="garmin">/);
  assert.match(html, /Pause Auto Follow/);
  assert.match(html, /approximate and arrive about every 2 minutes/i);
  assert.match(html, /Full Route/);
  assert.equal(manifest.generatedFiles.length, 13);
});

test("embed page exposes only the iframe-safe map shell", () => {
  const html = readOutput("embed/index.html");
  assert.match(html, /<body class="tracking-preview-embed-page" data-runner-source="garmin">/);
  assert.match(html, /id="tracking-map"/);
  assert.match(html, /data-feed="rv"/);
  assert.match(html, /data-feed="will"/);
  assert.match(html, /data-map-controls/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /tracker-nav|tracker-hero|site-footer|follow-form|googletagmanager|canonical/i);
  assert.doesNotMatch(html, /__[_A-Z]+__/);
  assert.match(html, /href="\/tracking-preview\/assets\/tracking-preview-[a-f0-9]{16}\.css"/);
  assert.match(html, /src="\/tracking-preview\/assets\/app-[a-f0-9]{16}\.mjs"/);
  assert.match(html, /about every 2 minutes/i);
  assert.doesNotMatch(html, /Pause Live Follow|Connecting to the public race feed/i);
  assert.equal(readOutput("garmin-feed.php"), readFileSync(join(import.meta.dirname, "source", "garmin-feed.php"), "utf8"));
  assert.match(readOutput(".htaccess"), /frame-ancestors https:\/\/50in24\.com https:\/\/www\.50in24\.com/);
  assert.match(readOutput(".htaccess"), /Header unset X-Frame-Options/);
  assert.match(readOutput(".htaccess"), /Header always unset X-Frame-Options/);
  assert.doesNotMatch(readOutput(".htaccess"), /frame-ancestors https:"/);
  assert.doesNotMatch(readOutput(".htaccess"), /frame-ancestors 'none'/);
  assert.doesNotMatch(readOutput(".htaccess"), /Header always set X-Frame-Options/);
});

test("full preview and embed use Garmin without a Strava runner branch", () => {
  const embed = readOutput("embed/index.html");
  const homepage = readOutput("index.html");
  const appSource = readOutput(asset("app").path);
  assert.match(embed, /data-runner-source="garmin"/);
  assert.match(homepage, /data-runner-source="garmin"/);
  assert.match(appSource, /load: \(\) => loadGarminRunnerLocation\(\)/);
  assert.match(appSource, /autoFollowSubject: "will"/);
  assert.doesNotMatch(appSource, /loadPublicRaceSnapshot|deriveWillLocation|const runnerSource|PUBLIC_RACES_ENDPOINT|PUBLIC_RACE_STATUS_ENDPOINT|["']strava["']/i);
  assert.match(appSource, /subject === "will" \? live : resolveScheduledLocation\(subject, live\)/);
});

test("Garmin loader NetworkLink is parsed and its 60-second hint is clamped to 120 seconds", () => {
  const loader = parseGarminNetworkLink(readFixture("garmin-loader.kml"));
  assert.equal(GARMIN_LOADER_URL, "https://share.garmin.com/Feed/ShareLoader/missionamerica");
  assert.equal(GARMIN_PROXY_ENDPOINT, "/tracking-preview/garmin-feed.php");
  assert.equal(loader.href, "https://eur-share.explore.garmin.com/Feed/Share/missionamerica");
  assert.equal(loader.advertisedRefreshMs, 60_000);
  assert.equal(loader.refreshMs, GARMIN_MIN_REFRESH_MS);
  assert.equal(GARMIN_MIN_REFRESH_MS, 120_000);
  assert.equal(allowedGarminFeedUrl(loader.href), true);
  assert.equal(allowedGarminFeedUrl("http://eur-share.explore.garmin.com/Feed/Share/missionamerica"), false);
  assert.equal(allowedGarminFeedUrl("https://example.com/Feed/Share/missionamerica"), false);
  assert.throws(() => parseGarminNetworkLink(readFixture("garmin-loader.kml").replace("eur-share.explore.garmin.com", "example.com")), /invalid_garmin_network_link/);
});

test("Garmin KML point and trail coordinates use KML longitude-latitude order", () => {
  const result = parseGarminFeed(readFixture("garmin-feed-with-track.kml"), {
    nowMs: Date.parse("2026-10-08T00:25:00Z"),
  });
  assert.deepEqual(result, {
    available: true,
    stale: false,
    observedAt: "2026-10-08T00:24:00.000Z",
    position: { lat: 21.32, lng: -157.85 },
    trail: [
      { lat: 21.31, lng: -157.86 },
      { lat: 21.315, lng: -157.855 },
      { lat: 21.32, lng: -157.85 },
    ],
  });
  assert.equal(parseGarminFeed(readFixture("garmin-feed-with-track.kml"), {
    nowMs: Date.parse("2026-10-08T00:40:01Z"),
  }).stale, true);
});

test("Garmin adapter follows the loader through the same-origin proxy", async () => {
  const loader = readFixture("garmin-loader.kml");
  const feed = readFixture("garmin-feed-with-track.kml");
  const targets = [];
  const result = await loadGarminRunnerLocation({
    nowMs: Date.parse("2026-10-08T00:25:00Z"),
    fetchImpl: async (url, options) => {
      const request = new URL(url, "https://goodwingoodge.com");
      targets.push({ target: request.searchParams.get("url"), options });
      return new Response(targets.length === 1 ? loader : feed, {
        status: 200,
        headers: { "content-type": "application/vnd.google-earth.kml+xml" },
      });
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
  });
  assert.deepEqual(targets.map(({ target }) => target), [
    GARMIN_LOADER_URL,
    "https://eur-share.explore.garmin.com/Feed/Share/missionamerica",
  ]);
  assert.ok(targets.every(({ options }) => options.cache === "no-store" && options.credentials === "omit"));
  assert.deepEqual(result.position, { lat: 21.32, lng: -157.85 });
});

test("empty, malformed, future, and unavailable Garmin feeds fail safely", async () => {
  assert.deepEqual(parseGarminFeed('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>'), {
    available: false, trail: [],
  });
  assert.throws(() => parseGarminFeed("<kml><Document></kml>"), /invalid_kml_xml/);
  const future = readFixture("garmin-feed-with-track.kml").replaceAll("2026-10-08T00:2", "2026-10-09T00:2");
  assert.deepEqual(parseGarminFeed(future, { nowMs: Date.parse("2026-10-08T00:25:00Z") }), { available: false, trail: [] });
  await assert.rejects(loadGarminRunnerLocation({
    fetchImpl: async () => new Response("unavailable", { status: 503, headers: { "content-type": "text/plain" } }),
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
  }), /garmin_feed_request_failed/);
  const lastKnown = parseGarminFeed(readFixture("garmin-feed-with-track.kml"), {
    nowMs: Date.parse("2026-10-08T00:25:00Z"),
  });
  assert.deepEqual(resolveGarminDisplayLocation({ available: false, trail: [] }, lastKnown), {
    ...lastKnown, stale: true,
  });
  assert.deepEqual(resolveGarminDisplayLocation(null, null), { available: false, trail: [] });
});

test("Garmin proxy is fixed-target, server-cached, and confined to the preview directory", () => {
  const proxy = readOutput("garmin-feed.php");
  const deploy = readFileSync(join(import.meta.dirname, "deploy.mjs"), "utf8");
  assert.match(proxy, /GARMIN_CACHE_SECONDS = 120/);
  assert.match(proxy, /GARMIN_STALE_SECONDS = 600/);
  assert.match(proxy, /share\.garmin\.com/);
  assert.match(proxy, /explore\\\.garmin\\\.com/);
  assert.match(proxy, /CURLOPT_FOLLOWLOCATION => false/);
  assert.match(proxy, /CURLOPT_PROTOCOLS => CURLPROTO_HTTPS/);
  assert.match(deploy, /garmin-feed\.php/);
  assert.doesNotMatch(proxy, /Access-Control-Allow-Origin:\s*\*/i);
});

test("preview and embed route tooltips show the three approved local race times", () => {
  for (const [city, expected] of [
    ["Los Angeles", "26. Los Angeles, California · Oct 21 · 10:45PM"],
    ["Portsmouth", "48. Portsmouth, New Hampshire · Oct 31 · 5:00AM"],
    ["Kittery", "49. Kittery, Maine · Oct 31 · 12:00PM"],
  ]) {
    const stop = ROUTE_STOPS.find((entry) => entry.city === city);
    assert.ok(stop, city);
    assert.equal(raceStopTooltip(stop), expected, city);
  }
  assert.equal(raceStopTooltip(ROUTE_STOPS[0]), "1. Honolulu, Hawaii");
});

test("OpenStreetMap policy and dark treatment remain compliant", () => {
  const mapSource = readOutput(asset("tracking-map").path);
  const css = readOutput(asset("tracking-preview").path);
  assert.equal(PREVIEW_TILE_PROVIDER.url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert.match(mapSource, /detectRetina: false/);
  assert.match(mapSource, /OpenStreetMap contributors/);
  assert.doesNotMatch(mapSource, /prefetch|serviceWorker|caches\.|cache:\s*["']reload|no-referrer/i);
  assert.match(css, /\.tracking-preview-map \.leaflet-tile-pane\s*\{\s*filter: grayscale\(1\) invert\(1\)/);
  assert.match(readOutput(".htaccess"), /https:\/\/tile\.openstreetmap\.org/);
  assert.match(readOutput(".htaccess"), /Referrer-Policy "strict-origin-when-cross-origin"/);
  assert.doesNotMatch(readOutput(".htaccess"), /no-referrer/i);
});

test("planned full-country route loads before feeds and survives feed failures", () => {
  const h = harness();
  assert.equal(h.calls.map, 1);
  assert.equal(h.calls.tile, 1);
  assert.deepEqual(h.calls.fitBounds[0].bounds, h.routeStops.map((stop) => [stop.lat, stop.lng]));
  const appSource = readOutput(asset("app").path);
  assert.ok(appSource.indexOf("createTrackingMap({") < appSource.indexOf("createAdaptivePoller({"));
  assert.match(appSource, /void rvPoller\.start\(\)/);
  assert.match(appSource, /void runnerPoller\.start\(\)/);
  assert.doesNotMatch(appSource, /await (?:rvPoller|runnerPoller)\.start/);
});

test("first fresh RV focuses at zoom 17 and later movement pans", () => {
  const h = harness({ reducedMotion: false });
  h.tracker.setRvLocation(freshRv());
  assert.equal(h.tracker.getRvState().kind, TRACKING_STATE.LIVE);
  assert.equal(h.tracker.getFollowing(), "rv");
  assert.equal(h.tracker.isLiveFollowEnabled(), true);
  assert.equal(h.buttons.live.textContent, "Pause Live Follow");
  assert.deepEqual(h.calls.fitBounds.at(-1).bounds, [[39.966123456, -82.934654321]]);
  assert.equal(h.calls.fitBounds.at(-1).options.maxZoom, 17);
  assert.equal(h.calls.fitBounds.at(-1).zoom, 17);
  h.tracker.setRvLocation(freshRv(39.967, -82.935, "2026-09-20T12:01:00.000Z"));
  assert.deepEqual(h.calls.panTo.at(-1).point, [39.967, -82.935]);
  assert.equal(h.calls.panTo.at(-1).zoom, 17);
});

test("first fresh Will focuses at zoom 17", () => {
  const h = harness({ reducedMotion: false });
  h.tracker.setWillLocation(freshWill());
  assert.equal(h.tracker.getFollowing(), "will");
  assert.deepEqual(h.calls.fitBounds.at(-1).bounds, [[40.123456789, -82.123456789]]);
  assert.equal(h.calls.fitBounds.at(-1).options.maxZoom, 17);
  assert.equal(h.calls.fitBounds.at(-1).zoom, 17);
});

test("Garmin runner fix places the marker and paints its trail", () => {
  const h = harness({
    reducedMotion: false,
    followLabels: { active: "Pause Auto Follow", paused: "Resume Auto Follow" },
    autoFollowSubject: "will",
  });
  const result = parseGarminFeed(readFixture("garmin-feed-with-track.kml"), {
    nowMs: Date.parse("2026-10-08T00:25:00Z"),
  });
  h.tracker.setWillLocation(result);
  assert.deepEqual(h.tracker.getMarker("will").point, [21.32, -157.85]);
  assert.deepEqual(h.tracker.getWillTrail().points, [
    [21.31, -157.86],
    [21.315, -157.855],
    [21.32, -157.85],
  ]);
  assert.equal(h.tracker.getWillTrail().options.color, "#5eead4");
  assert.equal(h.tracker.getWillState().kind, TRACKING_STATE.LIVE);
  assert.equal(h.buttons.live.textContent, "Pause Auto Follow");
});

test("Garmin Auto Follow supports zoom level 10 and preserves manual zoom while recentering", async () => {
  const h = harness({
    reducedMotion: false,
    followLabels: { active: "Pause Auto Follow", paused: "Resume Auto Follow" },
    autoFollowSubject: "will",
  });
  const initialFits = h.calls.fitBounds.length;
  h.tracker.setRvLocation(freshRv());
  assert.equal(h.calls.fitBounds.length, initialFits);

  h.tracker.setWillLocation(freshWill());
  assert.equal(h.tracker.getFollowing(), "will");
  assert.equal(h.calls.fitBounds.at(-1).zoom, FOLLOW_ZOOM);
  await Promise.resolve();

  h.tracker.map.setView([40.123456789, -82.123456789], 10, {});
  h.events.get("zoomend")();
  assert.equal(h.calls.panTo.at(-1).zoom, 10);
  assert.deepEqual(h.calls.panTo.at(-1).point, [40.123456789, -82.123456789]);
  await Promise.resolve();

  const fitsAfterManualZoom = h.calls.fitBounds.length;
  h.tracker.setRvLocation(freshRv(39.97, -82.94, "2026-09-20T12:02:00.000Z"));
  assert.equal(h.calls.panTo.at(-1).zoom, 10);
  assert.deepEqual(h.calls.panTo.at(-1).point, [40.123456789, -82.123456789]);
  await Promise.resolve();

  h.tracker.setWillLocation(freshWill(40.13, -82.13, "2026-09-20T12:03:00.000Z"));
  assert.equal(h.calls.fitBounds.length, fitsAfterManualZoom);
  assert.equal(h.calls.panTo.at(-1).zoom, 10);
  assert.deepEqual(h.calls.panTo.at(-1).point, [40.13, -82.13]);
  assert.equal(h.tracker.getFollowing(), "will");
});

test("Garmin runner updates do not mutate flight route or RV layers", () => {
  const h = harness({
    inputRouteStops: [
      { n: 1, lat: 21.3099, lng: -157.8581, city: "Honolulu", state: "Hawaii" },
      { n: 2, lat: 61.2181, lng: -149.9003, city: "Anchorage", state: "Alaska" },
    ],
  });
  const flightLayer = h.calls.polylines[0];
  assert.deepEqual(flightLayer.points, [[21.3099, -157.8581], [61.2181, -149.9003]]);
  assert.equal(flightLayer.options.weight, 2.6);
  assert.equal(flightLayer.options.dashArray, "12 10");
  h.tracker.setRvLocation(freshRv());
  const rvMarker = h.tracker.getMarker("rv");
  h.tracker.setWillLocation({ ...freshWill(), trail: [{ lat: 40.12, lng: -82.14 }, { lat: 40.123456789, lng: -82.123456789 }] });
  assert.equal(flightLayer.removed, undefined);
  assert.equal(h.tracker.getMarker("rv"), rvMarker);
  assert.deepEqual(rvMarker.point, [39.966123456, -82.934654321]);
  assert.equal(PUBLIC_RV_LOCATION_ENDPOINT, "/strava/public/tracking-status");
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
  assert.equal(h.calls.fitBounds.at(-1).options.maxZoom, 17);
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

test("stale Garmin results retain a dimmed last-known marker and trail", () => {
  const h = harness();
  const result = parseGarminFeed(readFixture("garmin-feed-with-track.kml"), {
    nowMs: Date.parse("2026-10-08T00:40:01Z"),
  });
  h.tracker.setWillLocation(result);
  assert.equal(h.tracker.getWillState().kind, TRACKING_STATE.STALE);
  assert.match(h.tracker.getMarker("will").options.icon.className, /will-stale/);
  assert.equal(h.tracker.getWillTrail().options.opacity, 0.45);
  assert.equal(h.tracker.getWillTrail().options.dashArray, "6 10");
  h.tracker.setWillLocation({ available: false });
  assert.equal(h.tracker.getMarker("will"), null);
  assert.equal(h.tracker.getWillTrail(), null);
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

test("maximum zoom is 17 and includes requested follow zoom level 10", () => {
  const h = harness();
  assert.equal(MAX_NATIVE_ZOOM, 17);
  assert.equal(FOLLOW_ZOOM, 17);
  assert.equal(h.calls.mapOptions.maxZoom, 17);
  assert.equal(h.calls.mapOptions.bounceAtZoomLimits, false);
  assert.equal(h.calls.tileOptions.maxZoom, 17);
  assert.equal(h.calls.tileOptions.maxNativeZoom, 17);
  assert.equal(h.calls.tileOptions.detectRetina, false);
  assert.ok(h.calls.mapOptions.maxZoom >= 10);
  h.tracker.map.setView([0, 1], 99, {});
  h.tracker.map.flyTo([1, 2], 99, {});
  assert.equal(h.calls.setView.at(-1).zoom, 17);
  assert.equal(h.calls.flyTo.at(-1).zoom, 17);
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

test("polling is immediate, non-overlapping, reconnect-aware, and bounded", async () => {
  assert.equal(RV_REFRESH_MS, 30_000);
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

test("Garmin polling cannot run more frequently than every 120 seconds", async () => {
  const timers = [];
  const windowListeners = new Map();
  let nowMs = 0;
  let calls = 0;
  const poller = createAdaptivePoller({
    intervalMs: GARMIN_MIN_REFRESH_MS,
    minimumIntervalMs: GARMIN_MIN_REFRESH_MS,
    load: async () => { calls += 1; return { available: false, trail: [] }; },
    onData() {},
    onFailure() {},
    nowImpl: () => nowMs,
    documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} },
    windowObject: {
      addEventListener(name, callback) { windowListeners.set(name, callback); },
      removeEventListener(name) { windowListeners.delete(name); },
    },
    setTimeoutImpl(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutImpl(timer) { timer.cleared = true; },
  });
  await poller.start();
  assert.equal(calls, 1);
  assert.equal(timers.at(-1).delay, 120_000);
  nowMs = 60_000;
  windowListeners.get("online")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  const firstActiveTimer = timers.find((timer) => !timer.cleared);
  nowMs = 120_000;
  firstActiveTimer.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(timers.filter((timer) => !timer.cleared).at(-1).delay, 120_000);
  poller.destroy();
});

test("mobile, keyboard, and reduced-motion support are present", () => {
  const html = readOutput("index.html");
  const css = readOutput(asset("tracking-preview").path);
  const mapSource = readOutput(asset("tracking-map").path);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="group" aria-label="Map view controls"/);
  assert.match(css, /@media \(max-width: 380px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(mapSource, /keyboard: true/);
  assert.match(mapSource, /animate: Boolean\(animate && !reducedMotion\)/);
});


test("airport placement windows honor local offsets and exact start/end boundaries", () => {
  const feed = { available: false };
  for (const entry of STATIC_PLACEMENTS) {
    const start = Date.parse(entry.start);
    const end = Date.parse(entry.end);
    assert.equal(resolveScheduledLocation(entry.subject, feed, start - 1), feed);
    assert.deepEqual(resolveScheduledLocation(entry.subject, feed, start).position, entry.position);
    assert.equal(resolveScheduledLocation(entry.subject, feed, end - 1).scheduled, true);
    assert.equal(resolveScheduledLocation(entry.subject, feed, end), feed);
    const other = entry.subject === "will" ? "rv" : "will";
    assert.equal(resolveScheduledLocation(other, feed, start), feed);
  }
  assert.equal(Date.parse(STATIC_PLACEMENTS[0].start), Date.parse("2026-10-10T07:11:00Z"));
  assert.equal(Date.parse("2026-10-09T23:11:00-10:00") - Date.parse(STATIC_PLACEMENTS[0].start), 2 * 60 * 60 * 1000);
});

test("scheduled placement survives unavailable feeds and releases to the latest feed", () => {
  const entry = STATIC_PLACEMENTS[1];
  const live = { available: true, stale: false, observedAt: entry.end, position: { lat: 61, lng: -150 } };
  assert.equal(resolveScheduledLocation("will", live, Date.parse(entry.start)).scheduled, true);
  assert.equal(resolveScheduledLocation("will", live, Date.parse(entry.end)), live);
  const h = harness();
  h.tracker.setWillLocation(resolveScheduledLocation("will", null, Date.parse(entry.start)));
  assert.equal(h.tracker.getWillState().kind, TRACKING_STATE.SCHEDULED);
  assert.match(h.tracker.getMarker("will").popup, /scheduled airport placement/);
});
