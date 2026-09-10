import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const port = Number(process.argv[2] || 4192);
const sourceHtml = readFileSync(
  process.argv[3] || "/tmp/team-goodwin-countdown-live-fresh.html",
  "utf8",
);
const tracker = readFileSync(new URL(
  "../production-merge/mission-window-alignment-2026-09-09/public_html/assets/tracker-base.js",
  import.meta.url,
));
const mapModule = readFileSync(new URL(
  "../production-merge/mission-window-alignment-2026-09-09/public_html/assets/strava-race-map.mjs",
  import.meta.url,
));
const START = "2026-10-09T09:00:00-04:00";
const END = "2026-11-01T23:59:59-05:00";
const states = Object.freeze({
  pre: "2026-10-09T08:59:59-04:00",
  start: START,
  active: "2026-10-20T12:00:00-04:00",
  "dst-edt": "2026-11-01T01:30:00-04:00",
  "dst-est": "2026-11-01T01:30:00-05:00",
  final: END,
  complete: "2026-11-02T00:00:00-05:00",
});

function send(response, status, body, contentType, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}

function previewMarkup(state, timestamp) {
  const links = Object.keys(states).map((name) =>
    `<a href="/?state=${encodeURIComponent(name)}#map"${name === state ? ' aria-current="page"' : ""}>${name}</a>`
  ).join("");
  const bootstrap = `<script data-local-mission-window-preview>
    (() => {
      const fixedNow = ${JSON.stringify(timestamp)};
      const NativeDate = Date;
      class PreviewDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [fixedNow])); }
        static now() { return NativeDate.parse(fixedNow); }
      }
      window.Date = PreviewDate;
      window.__MISSION_WINDOW_PREVIEW__ = Object.freeze({ state: ${JSON.stringify(state)}, now: fixedNow });
    })();
  </script>`;
  const toolbar = `<aside data-local-mission-window-controls style="position:fixed;z-index:2147483647;right:12px;bottom:12px;max-width:min(680px,calc(100vw - 24px));padding:10px 12px;background:#111;color:#fff;border:1px solid #fff;font:12px/1.4 system-ui;box-shadow:0 8px 30px #0008"><strong>LOCAL MISSION WINDOW</strong><div>${timestamp}</div><nav style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">${links}</nav></aside>`;
  return sourceHtml
    .replace("<head>", `<head>${bootstrap}`)
    .replace("</body>", `${toolbar}</body>`);
}

async function proxyProduction(requestUrl, response) {
  try {
    const upstream = await fetch(new URL(requestUrl.pathname + requestUrl.search, "https://goodwingoodge.com"), {
      headers: { Accept: requestUrl.pathname.endsWith(".json") ? "application/json" : "*/*" },
      redirect: "follow",
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    send(response, upstream.status, body, upstream.headers.get("content-type") || "application/octet-stream");
  } catch {
    send(response, 502, "preview_proxy_failed", "text/plain; charset=utf-8");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  const state = Object.hasOwn(states, url.searchParams.get("state")) ? url.searchParams.get("state") : "pre";
  const timestamp = states[state];
  const nowMs = Date.parse(timestamp);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    send(response, 200, previewMarkup(state, timestamp), "text/html; charset=utf-8");
    return;
  }
  if (url.pathname === "/assets/tracker-base.js") {
    send(response, 200, tracker, "text/javascript; charset=utf-8");
    return;
  }
  if (url.pathname === "/assets/strava-race-map.mjs") {
    send(response, 200, mapModule, "text/javascript; charset=utf-8");
    return;
  }
  if (url.pathname === "/strava/public/race-status") {
    send(response, 200, JSON.stringify({
      active: nowMs >= Date.parse(START) && nowMs <= Date.parse(END),
      raceWindowId: "ggma-2026",
      raceWindowStart: START,
      raceWindowEnd: END,
      completedRaces: 0,
      totalRaces: 50,
    }), "application/json; charset=utf-8");
    return;
  }
  if (url.pathname === "/strava/public/tracking-status") {
    send(response, 200, JSON.stringify({ available: false }), "application/json; charset=utf-8");
    return;
  }
  await proxyProduction(url, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Team Goodwin mission-window preview: http://127.0.0.1:${port}/?state=pre#map`);
});
