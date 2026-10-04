import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const artifactRoot = new URL(
  "../production-merge/hapn-api2-production-base-patch-2026-09-09/public_html/assets/",
  import.meta.url,
);
const productionAssetRoot = new URL(
  "../production-merge/strava-live-map-2026-09-06/public_html/assets/",
  import.meta.url,
);
const resultFile = new URL(
  "../production-merge/hapn-api2-production-base-patch-2026-09-09/validation-results.json",
  import.meta.url,
);
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const productionOrigin = "https://goodwingoodge.com";

const [html, productionTracker, candidateTracker, productionRaceModule, candidateRaceModule] = await Promise.all([
  readFile("/tmp/goodwin-live.html"),
  readFile(new URL("tracker-base.js", productionAssetRoot)),
  readFile(new URL("tracker-base.js", artifactRoot)),
  readFile(new URL("strava-race-map.mjs", productionAssetRoot)),
  readFile(new URL("strava-race-map.mjs", artifactRoot)),
]);

function publicRaceFixture() {
  const source = candidateTracker.toString();
  const block = source.match(/const staticRouteStops = \[([\s\S]*?)\n    \];/)?.[1] || "";
  const dates = new Map([
    ["Oct 9", "2026-10-09"], ["Oct 10", "2026-10-10"], ["Oct 11", "2026-10-11"],
    ["Oct 12", "2026-10-12"], ["Oct 13", "2026-10-13"], ["Oct 14", "2026-10-14"],
    ["Oct 15", "2026-10-15"], ["Oct 16", "2026-10-16"], ["Oct 17", "2026-10-17"],
    ["Oct 18", "2026-10-18"], ["Oct 19", "2026-10-19"], ["Oct 20", "2026-10-20"],
    ["Oct 21", "2026-10-21"], ["Oct 22", "2026-10-22"], ["Oct 23", "2026-10-23"],
    ["Oct 24", "2026-10-24"], ["Oct 25", "2026-10-25"], ["Oct 26", "2026-10-26"],
    ["Oct 27", "2026-10-27"], ["Oct 28", "2026-10-28"], ["Oct 29", "2026-10-29"],
    ["Oct 30", "2026-10-30"], ["Oct 31", "2026-10-31"], ["Nov 1", "2026-11-01"],
  ]);
  const races = [...block.matchAll(
    /\{ n: (\d+), state: "([^"]+)", abbr: "[^"]+", city: "([^"]+)", date: "([^"]+)"/g,
  )].map((match) => ({
    raceNumber: Number(match[1]),
    raceId: `ggma-2026-${String(match[1]).padStart(2, "0")}`,
    date: dates.get(match[4]),
    state: match[2],
    city: match[3],
    status: "scheduled",
  }));
  if (races.length !== 50 || races.some((race) => !race.date)) throw new Error("fixture_schedule_invalid");
  races[0] = {
    ...races[0],
    status: "completed",
    activity: {
      stravaActivityId: "1234567890123456789",
      startTime: "2026-10-09T06:00:00-04:00",
      distanceMeters: 42195,
      movingTimeSeconds: 10800,
      elapsedTimeSeconds: 11100,
      elevationGainMeters: 120,
      summaryPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
      startLatLng: [38.5, -120.2],
      endLatLng: [43.252, -126.453],
    },
  };
  return { races };
}

const racesFixture = Buffer.from(JSON.stringify(publicRaceFixture()));
function statusFixture(active = true) {
  return Buffer.from(JSON.stringify({
    active,
    raceWindowId: "ggma-2026",
    raceWindowStart: "2026-10-09T00:00:00-04:00",
    raceWindowEnd: "2026-11-01T23:59:59-05:00",
    completedRaces: 1,
    totalRaces: 50,
  }));
}

function rvFixture(position = "first", stale = false, observedAt = "2026-10-10T12:00:00.000Z") {
  return Buffer.from(JSON.stringify({
    available: true,
    stale,
    observedAt: stale ? "2026-10-10T10:00:00.000Z" : observedAt,
    position: position === "second"
      ? { lat: 41.2, lng: -73.8 }
      : { lat: 40.831, lng: -74.117 },
  }));
}

const septemberStaleFixture = Buffer.from(JSON.stringify({
  available: true,
  stale: true,
  observedAt: "2026-09-09T01:00:53.000Z",
  position: { lat: 39.966, lng: -82.934 },
}));

function send(res, status, body, contentType) {
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-length": body.length,
    "content-type": contentType,
  });
  res.end(body);
}

async function proxyProduction(req, res) {
  try {
    const upstream = await fetch(new URL(req.url, productionOrigin), {
      headers: req.headers.range ? { range: req.headers.range } : undefined,
      redirect: "manual",
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const headers = {};
    for (const [name, value] of upstream.headers) {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name)) {
        headers[name] = value;
      }
    }
    headers["content-length"] = body.length;
    res.writeHead(upstream.status, headers);
    res.end(body);
  } catch {
    send(res, 502, Buffer.from("preview_proxy_failed"), "text/plain; charset=utf-8");
  }
}

async function createPreview({ candidate, hapn = "healthy", strava = "healthy", raceStatus = "active", now }) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://preview.invalid");
    requests.push(url.pathname);
    if (url.pathname === "/" || url.pathname === "/live-tracking/") {
      send(res, 200, html, "text/html; charset=utf-8");
    } else if (url.pathname === "/assets/tracker-base.js") {
      send(res, 200, candidate ? candidateTracker : productionTracker, "text/javascript; charset=utf-8");
    } else if (url.pathname === "/assets/strava-race-map.mjs") {
      send(res, 200, candidate ? candidateRaceModule : productionRaceModule, "text/javascript; charset=utf-8");
    } else if (url.pathname === "/api/tracking-status") {
      send(res, 200, Buffer.from("{}"), "application/json");
    } else if (url.pathname === "/strava/public/races") {
      if (strava === "down") send(res, 503, Buffer.from('{"error":"unavailable"}'), "application/json");
      else send(res, 200, racesFixture, "application/json");
    } else if (url.pathname === "/strava/public/race-status") {
      if (strava === "down") send(res, 503, Buffer.from('{"error":"unavailable"}'), "application/json");
      else if (raceStatus === "malformed") send(res, 200, Buffer.from('{"active":true}'), "application/json");
      else send(res, 200, statusFixture(raceStatus === "active"), "application/json");
    } else if (url.pathname === "/strava/public/tracking-status") {
      const requestNumber = requests.filter((path) => path === "/strava/public/tracking-status").length;
      if (hapn === "timeout") {
        setTimeout(() => send(res, 200, rvFixture("first", false, now), "application/json"), 5_500);
      } else if (hapn === "down") {
        send(res, 503, Buffer.from('{"error":"unavailable"}'), "application/json");
      } else if (hapn === "malformed") {
        send(res, 200, Buffer.from('{"available":true,"position":"wrong"}'), "application/json");
      } else if (hapn === "stale") {
        send(res, 200, rvFixture("first", true), "application/json");
      } else if (hapn === "september-stale") {
        send(res, 200, septemberStaleFixture, "application/json");
      } else if (hapn === "fresh-stale") {
        send(res, 200, requestNumber === 1 ? rvFixture("first", false, now) : rvFixture("first", true), "application/json");
      } else if (hapn === "stale-fresh") {
        send(res, 200, requestNumber === 1 ? rvFixture("first", true) : rvFixture("second", false, now), "application/json");
      } else {
        send(res, 200, rvFixture(hapn === "healthy-second" ? "second" : "first", false, now), "application/json");
      }
    } else {
      await proxyProduction(req, res);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

class CdpSession {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.socket.close();
  }
}

async function waitUntil(check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("browser_validation_timeout");
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function launchChrome() {
  const profile = await mkdtemp(join(tmpdir(), "goodwin-map-chrome-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--force-prefers-reduced-motion",
    "--window-size=390,844",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const debuggerUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`chrome_start_timeout:${stderr}`)), 10_000);
    chrome.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    chrome.once("exit", (code) => reject(new Error(`chrome_exited:${code}:${stderr}`)));
  });
  const port = new URL(debuggerUrl).port;
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("chrome_page_missing");
  return {
    chrome,
    profile,
    page,
    close: async () => {
      chrome.kill("SIGTERM");
      await new Promise((resolve) => chrome.once("exit", resolve));
      await rm(profile, { recursive: true, force: true });
    },
  };
}

async function inspectPreview(options) {
  const preview = await createPreview(options);
  const browser = await launchChrome();
  const cdp = new CdpSession(browser.page.webSocketDebuggerUrl);
  const failedRequests = [];
  const requestUrls = new Map();
  const consoleErrors = [];
  const consoleWarnings = [];
  const responseStatuses = [];
  try {
    await cdp.open();
    cdp.on("Network.requestWillBeSent", (event) => requestUrls.set(event.requestId, event.request.url));
    cdp.on("Network.loadingFailed", (event) => failedRequests.push({
      url: requestUrls.get(event.requestId) || null,
      error: event.errorText,
      canceled: event.canceled,
      type: event.type,
    }));
    cdp.on("Network.responseReceived", (event) => responseStatuses.push({ url: event.response.url, status: event.response.status }));
    cdp.on("Runtime.consoleAPICalled", (event) => {
      const text = event.args.map((argument) => argument.value ?? argument.description ?? "").join(" ");
      if (event.type === "error") consoleErrors.push(text);
      if (event.type === "warning") consoleWarnings.push(text);
    });
    cdp.on("Runtime.exceptionThrown", (event) => consoleErrors.push(event.exceptionDetails.text));
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
    ]);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        Date.now = () => Date.parse(${JSON.stringify(options.now || "2026-10-10T12:05:00.000Z")});
        globalThis.__goodwinCls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) globalThis.__goodwinCls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      `,
    });
    await cdp.send("Page.navigate", { url: `${preview.origin}/` });
    await waitUntil(() => evaluate(cdp, "document.readyState === 'complete'"));
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    const initial = await evaluate(cdp, `({
      mapSvg: document.querySelectorAll('#mission-map svg').length,
      cls: globalThis.__goodwinCls || 0,
      resources: performance.getEntriesByType('resource').map((entry) => entry.name),
    })`);
    const requestBoundary = preview.requests.length;
    const renderStart = await evaluate(cdp, `(() => {
      document.body.classList.remove('has-splash-modal-open');
      document.querySelector('[data-splash-modal]')?.remove();
      document.querySelector('.tracker-map-stage').scrollIntoView({ block: 'center' });
      return performance.now();
    })()`);
    await waitUntil(() => evaluate(cdp, "Boolean(document.querySelector('#mission-map svg'))"));
    const renderEnd = await evaluate(cdp, "performance.now()");

    if (options.candidate && options.strava !== "down" && options.raceStatus !== "malformed") {
      await waitUntil(() => evaluate(cdp, "document.querySelectorAll('.map-activity-route').length === 1"));
    } else if (options.candidate) {
      await waitUntil(() => evaluate(cdp, "document.getElementById('mission-map')?.dataset.mapReady === 'true'"));
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    if (["healthy", "healthy-second", "fresh-stale", "stale-fresh"].includes(options.hapn)
      && options.raceStatus === "active" && options.strava !== "down") {
      await waitUntil(() => evaluate(cdp, "document.querySelector('#mission-map .map-entity-marker.rv')?.getAttribute('transform') !== null"));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (options.hapn === "timeout") await new Promise((resolve) => setTimeout(resolve, 5_250));

    let transition = null;
    if (options.hapn === "fresh-stale" || options.hapn === "stale-fresh") {
      const before = await evaluate(cdp, "document.querySelector('#mission-map .map-entity-marker.rv')?.getAttribute('transform') || null");
      await evaluate(cdp, "missionHapnPoller.refresh()");
      await new Promise((resolve) => setTimeout(resolve, 250));
      const after = await evaluate(cdp, "document.querySelector('#mission-map .map-entity-marker.rv')?.getAttribute('transform') || null");
      transition = { before, after };
    }

    const afterMap = await evaluate(cdp, `({
      states: document.querySelectorAll('#mission-map .map-state').length,
      markers: document.querySelectorAll('#mission-map .map-stop').length,
      coreRoutes: document.querySelectorAll('#mission-map path.map-route.future, #mission-map path.map-route.complete:not(.map-activity-route), #mission-map path.map-route.rv').length,
      flightRoutes: document.querySelectorAll('#mission-map path.map-route.flight').length,
      activityRoutes: document.querySelectorAll('#mission-map .map-activity-route').length,
      runnerMarkers: document.querySelectorAll('#mission-map .map-entity-marker.runner').length,
      rvMarkers: document.querySelectorAll('#mission-map .map-entity-marker.rv').length,
      rvTransform: document.querySelector('#mission-map .map-entity-marker.rv')?.getAttribute('transform') || null,
      mapReady: document.getElementById('mission-map')?.dataset.mapReady === 'true',
      ariaLabel: document.getElementById('mission-map')?.getAttribute('aria-label'),
      cls: globalThis.__goodwinCls || 0,
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
      brokenFirstPartyImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src)
        .filter((url) => { try { return new URL(url).origin === location.origin; } catch { return false; } }),
      resources: performance.getEntriesByType('resource').map((entry) => entry.name),
    })`);
    const classifiedFailures = failedRequests.map((failure) => {
      const responseStatus = responseStatuses.find((response) => response.url === failure.url)?.status ?? null;
      return {
        ...failure,
        responseStatus,
        countedFailure: !(Number.isInteger(responseStatus) && responseStatus >= 200 && responseStatus < 400),
      };
    });
    return {
      scenario: options,
      initial,
      afterMap,
      staticMapRenderMs: Math.round((renderEnd - renderStart) * 10) / 10,
      nearViewportRequests: preview.requests.slice(requestBoundary),
      responseStatuses,
      failedRequests: classifiedFailures,
      consoleErrors,
      consoleWarnings,
      transition,
    };
  } finally {
    cdp.close();
    await browser.close();
    await preview.close();
  }
}

const results = [];
for (const scenario of [
  { name: "production-baseline", candidate: false, hapn: "down", strava: "healthy", raceStatus: "inactive", now: "2026-09-09T01:05:00.000Z" },
  { name: "current-september-stale", candidate: true, hapn: "september-stale", strava: "healthy", raceStatus: "inactive", now: "2026-09-09T01:05:00.000Z" },
  { name: "before-start", candidate: true, hapn: "healthy", strava: "healthy", raceStatus: "inactive", now: "2026-10-09T03:59:59.000Z" },
  { name: "exact-start-fresh", candidate: true, hapn: "healthy", strava: "healthy", raceStatus: "active", now: "2026-10-09T04:00:00.000Z" },
  { name: "changed-coordinate", candidate: true, hapn: "healthy-second", strava: "healthy", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "hapn-stale", candidate: true, hapn: "stale", strava: "healthy", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "hapn-down", candidate: true, hapn: "down", strava: "healthy", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "hapn-malformed", candidate: true, hapn: "malformed", strava: "healthy", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "hapn-timeout", candidate: true, hapn: "timeout", strava: "healthy", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "fresh-to-stale", candidate: true, hapn: "fresh-stale", strava: "healthy", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "stale-to-fresh", candidate: true, hapn: "stale-fresh", strava: "healthy", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "strava-down-hapn-fresh", candidate: true, hapn: "healthy", strava: "down", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "all-down", candidate: true, hapn: "down", strava: "down", raceStatus: "active", now: "2026-10-10T12:05:00.000Z" },
  { name: "status-malformed", candidate: true, hapn: "healthy", strava: "healthy", raceStatus: "malformed", now: "2026-10-10T12:05:00.000Z" },
  { name: "exact-end-fresh", candidate: true, hapn: "healthy", strava: "healthy", raceStatus: "active", now: "2026-11-02T04:59:59.000Z" },
  { name: "after-end", candidate: true, hapn: "healthy", strava: "healthy", raceStatus: "inactive", now: "2026-11-02T05:00:00.000Z" },
]) {
  console.error(`validating:${scenario.name}`);
  results.push(await inspectPreview(scenario));
}

const byName = new Map(results.map((result) => [result.scenario.name, result]));
const staticTransform = byName.get("current-september-stale").afterMap.rvTransform;
for (const result of results) {
  assert.equal(result.initial.mapSvg, 0, `${result.scenario.name}: map must remain lazy`);
  assert.equal(result.initial.resources.some((url) => url.includes("/strava/")), false, `${result.scenario.name}: no initial provider requests`);
  assert.equal(result.afterMap.states, 51, `${result.scenario.name}: state shapes`);
  assert.equal(result.afterMap.markers, 50, `${result.scenario.name}: race markers`);
  assert.equal(result.afterMap.coreRoutes, 3, `${result.scenario.name}: core routes`);
  assert.equal(result.afterMap.flightRoutes, 5, `${result.scenario.name}: flight paths`);
  assert.equal(result.afterMap.runnerMarkers, 1, `${result.scenario.name}: runner marker`);
  assert.equal(result.afterMap.rvMarkers, 1, `${result.scenario.name}: RV marker`);
  assert.deepEqual(result.afterMap.brokenFirstPartyImages, [], `${result.scenario.name}: broken first-party images`);
  assert.equal(result.consoleErrors.length, 0, `${result.scenario.name}: console errors`);
}
for (const name of ["current-september-stale", "before-start", "strava-down-hapn-fresh", "all-down", "status-malformed", "after-end"]) {
  const result = byName.get(name);
  assert.equal(result.nearViewportRequests.filter((path) => path === "/strava/public/tracking-status").length, 0, `${name}: HAPN must not poll`);
  assert.equal(result.afterMap.rvTransform, staticTransform, `${name}: static RV position`);
}
for (const name of ["exact-start-fresh", "changed-coordinate", "hapn-stale", "hapn-down", "hapn-malformed", "hapn-timeout", "exact-end-fresh"]) {
  assert.equal(byName.get(name).nearViewportRequests.filter((path) => path === "/strava/public/tracking-status").length, 1, `${name}: exactly one eligible HAPN poll`);
}
for (const name of ["hapn-stale", "hapn-down", "hapn-malformed", "hapn-timeout"]) {
  assert.equal(byName.get(name).afterMap.rvTransform, staticTransform, `${name}: static RV fallback`);
}
assert.notEqual(byName.get("exact-start-fresh").afterMap.rvTransform, staticTransform, "fresh HAPN moves RV at exact start");
assert.notEqual(byName.get("exact-end-fresh").afterMap.rvTransform, staticTransform, "fresh HAPN moves RV at exact end");
assert.notEqual(byName.get("changed-coordinate").afterMap.rvTransform, byName.get("exact-start-fresh").afterMap.rvTransform, "new HAPN coordinate moves RV");
assert.notEqual(byName.get("fresh-to-stale").transition.before, staticTransform, "fresh-to-stale begins live");
assert.equal(byName.get("fresh-to-stale").transition.after, staticTransform, "fresh-to-stale restores exact static RV");
assert.equal(byName.get("stale-to-fresh").transition.before, staticTransform, "stale-to-fresh begins static");
assert.notEqual(byName.get("stale-to-fresh").transition.after, staticTransform, "stale-to-fresh moves RV live");
assert.equal(byName.get("fresh-to-stale").nearViewportRequests.filter((path) => path === "/strava/public/tracking-status").length, 2);
assert.equal(byName.get("stale-to-fresh").nearViewportRequests.filter((path) => path === "/strava/public/tracking-status").length, 2);
assert.ok(
  byName.get("current-september-stale").staticMapRenderMs <= byName.get("production-baseline").staticMapRenderMs * 1.15,
  "candidate static map render must remain within 15% of production baseline",
);

await writeFile(resultFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify(results.map((result) => ({
  scenario: result.scenario,
  initialMapSvg: result.initial.mapSvg,
  initialStravaRequests: result.initial.resources.filter((url) => url.includes("/strava/") || url.includes("strava-race-map")),
  staticMapRenderMs: result.staticMapRenderMs,
  states: result.afterMap.states,
  markers: result.afterMap.markers,
  coreRoutes: result.afterMap.coreRoutes,
  activityRoutes: result.afterMap.activityRoutes,
  flightRoutes: result.afterMap.flightRoutes,
  rvTransform: result.afterMap.rvTransform,
  initialHapnRequests: result.initial.resources.filter((url) => url.includes("tracking-status")),
  failedRequests: result.failedRequests.filter((failure) => failure.countedFailure).length,
  consoleErrors: result.consoleErrors.length,
  consoleWarnings: result.consoleWarnings,
  cls: result.afterMap.cls,
})), null, 2));
