import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const artifactRoot = new URL(
  "../production-merge/mission-window-alignment-2026-09-09/public_html/assets/",
  import.meta.url,
);
const resultFile = new URL(
  "../production-merge/mission-window-alignment-2026-09-09/validation-results.json",
  import.meta.url,
);
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const productionOrigin = "https://goodwingoodge.com";

const [html, productionTracker, candidateTracker, raceModule] = await Promise.all([
  readFile("/tmp/team-goodwin-countdown-live-fresh.html"),
  readFile("/tmp/team-goodwin-countdown-tracker-fresh.js"),
  readFile(new URL("tracker-base.js", artifactRoot)),
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
      startTime: "2026-10-09T09:00:00-04:00",
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
const statusFixture = Buffer.from(JSON.stringify({
  active: true,
  raceWindowId: "ggma-2026",
  raceWindowStart: "2026-10-09T09:00:00-04:00",
  raceWindowEnd: "2026-11-01T23:59:59-05:00",
  completedRaces: 1,
  totalRaces: 50,
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

async function createPreview({ candidate, failure }) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://preview.invalid");
    requests.push(url.pathname);
    if (url.pathname === "/" || url.pathname === "/live-tracking/") {
      send(res, 200, html, "text/html; charset=utf-8");
    } else if (url.pathname === "/assets/tracker-base.js") {
      send(res, 200, candidate ? candidateTracker : productionTracker, "text/javascript; charset=utf-8");
    } else if (url.pathname === "/assets/strava-race-map.mjs") {
      if (failure === "module") send(res, 404, Buffer.from("not_found"), "text/plain; charset=utf-8");
      else send(res, 200, raceModule, "text/javascript; charset=utf-8");
    } else if (url.pathname === "/strava/public/races") {
      if (failure === "api") send(res, 503, Buffer.from('{"error":"unavailable"}'), "application/json");
      else send(res, 200, racesFixture, "application/json");
    } else if (url.pathname === "/strava/public/race-status") {
      if (failure === "api") send(res, 503, Buffer.from('{"error":"unavailable"}'), "application/json");
      else send(res, 200, statusFixture, "application/json");
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

    if (options.candidate && !options.failure) {
      await waitUntil(() => evaluate(cdp, "document.querySelectorAll('.map-activity-route').length === 1"));
    } else if (options.candidate) {
      await waitUntil(() => evaluate(cdp, "document.getElementById('mission-map')?.dataset.mapReady === 'true'"));
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    const afterMap = await evaluate(cdp, `({
      states: document.querySelectorAll('#mission-map .map-state').length,
      markers: document.querySelectorAll('#mission-map .map-stop').length,
      coreRoutes: document.querySelectorAll('#mission-map path.map-route.future, #mission-map path.map-route.complete:not(.map-activity-route), #mission-map path.map-route.rv').length,
      flightRoutes: document.querySelectorAll('#mission-map path.map-route.flight').length,
      activityRoutes: document.querySelectorAll('#mission-map .map-activity-route').length,
      runnerMarkers: document.querySelectorAll('#mission-map .map-entity-marker.runner').length,
      rvMarkers: document.querySelectorAll('#mission-map .map-entity-marker.rv').length,
      mapReady: document.getElementById('mission-map')?.dataset.mapReady === 'true',
      ariaLabel: document.getElementById('mission-map')?.getAttribute('aria-label'),
      cls: globalThis.__goodwinCls || 0,
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
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
    };
  } finally {
    cdp.close();
    await browser.close();
    await preview.close();
  }
}

const results = [];
for (const scenario of [
  { candidate: false, failure: null },
  { candidate: true, failure: null },
  { candidate: true, failure: "api" },
  { candidate: true, failure: "module" },
]) {
  results.push(await inspectPreview(scenario));
}

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
  failedRequests: result.failedRequests.filter((failure) => failure.countedFailure).length,
  consoleErrors: result.consoleErrors.length,
  consoleWarnings: result.consoleWarnings,
  cls: result.afterMap.cls,
})), null, 2));
