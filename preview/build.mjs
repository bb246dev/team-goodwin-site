import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "preview", "dist");
const prefix = "/client-preview";
const routes = [
  "index", "live-tracking", "the-run", "will", "fifty-runs", "updates",
  "faq", "week-1", "week-2", "week-3", "partners", "athletes",
  "privacy", "terms", "participation-terms", "accessibility",
];

function replaceOne(value, before, after, name) {
  if (!value.includes(before)) throw new Error(`Preview source changed: ${name}`);
  return value.replace(before, after);
}

const previewStyles = `<style data-client-preview-styles>
.client-preview-link{position:fixed;right:16px;bottom:16px;z-index:50;display:inline-flex;gap:8px;align-items:center;padding:12px 16px;border:1px solid #b8d4cc;border-radius:999px;background:#103b35;color:#fff!important;font:600 13px/1.25 Inter,Arial,sans-serif;text-decoration:none;box-shadow:0 12px 30px #0004}
.client-preview-feeds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 22px}
.client-preview-feed{padding:16px 18px;border:1px solid #bdd1ca;border-radius:10px;background:#eff7f3;color:#143d35}
.client-preview-feed strong{display:block;margin-bottom:5px;font-size:15px}
.client-preview-feed span{display:block;font-size:13px;line-height:1.45}
.client-preview-feed[data-state="live"],.client-preview-feed[data-state="activity"]{background:#e5f5e8;border-color:#7cbd8a}
.client-preview-feed[data-state="stale"],.client-preview-feed[data-state="error"]{background:#fff6e9;border-color:#e3c899}
.client-preview-note{margin:10px 0 0;color:#d9e6e0;font-size:12px;line-height:1.5}
@media(max-width:640px){.client-preview-feeds{grid-template-columns:1fr}.client-preview-link{left:16px;right:16px;justify-content:center}}
</style>`;

const previewGuard = `<script data-client-preview-guard>
document.addEventListener("submit", (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const message = document.querySelector("[data-follow-message]") || document.querySelector("[data-preview-action-message]");
  if (message) message.textContent = "This action is disabled in the client preview.";
}, true);
document.addEventListener("click", (event) => {
  const link = event.target.closest?.('a[data-rsvp-link],a[href*="tally.so/"],a[href*="live-mission-america-50.pantheonsite.io/"]');
  if (!link) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const message = document.querySelector("[data-preview-action-message]");
  if (message) message.textContent = "RSVP and donation actions are disabled in the client preview.";
}, true);
</script>`;

const feedMarkup = `<div class="client-preview-feeds" aria-label="Open tracking feeds">
  <div class="client-preview-feed" data-preview-feed="rv" data-state="loading" role="status" aria-live="polite"><strong>RV tracking · Open for review</strong><span>Connecting to the RV feed…</span></div>
  <div class="client-preview-feed" data-preview-feed="will" data-state="loading" role="status" aria-live="polite"><strong>Will's race feed · Open for review</strong><span>Connecting to the race API…</span></div>
</div><p class="client-preview-note">Client review: current API data and clearly labeled last-known RV positions are shown when available. RSVP, sign-up and donation actions are disabled. <span data-preview-action-message aria-live="polite"></span></p>`;

function transformHtml(raw, route) {
  let html = raw.replaceAll("\0", "");
  html = html.replace(/\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]+"><\/script>\s*<script>\s*window\.dataLayer[\s\S]*?gtag\('config', '[^']+'\);\s*<\/script>/g, "");
  html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "");
  html = html.replace(/<meta\s+name=["']robots["'][^>]*>/gi, "");
  html = html.replace(/(<meta name="viewport"[^>]*>)/i, `$1\n<meta name="robots" content="noindex, nofollow">\n<meta name="googlebot" content="noindex, nofollow">`);
  html = html.replace(/\b(href|src|poster|data-src)="(?:\.\.\/)+assets\//g, '$1="/assets/');
  html = html.replace(/\b(href|src|poster|data-src)="(?:\.\.\/)+fonts\//g, '$1="/fonts/');
  html = html.replace(/\bhref="\/(?!\/|assets\/|fonts\/|strava\/|api\/|client-preview\/)([^"]*)"/g, (_full, path) => `href="${prefix}/${path}"`);
  html = html.replace('src="/assets/tracker-base.js?v=20260831mobile-critical-path"', `src="${prefix}/assets/tracker-base.js"`);
  html = html.replace("</head>", `${previewStyles}\n${previewGuard}\n</head>`);
  if (route === "index" || route === "live-tracking") {
    html = replaceOne(html, '<section class="tracker-section" id="map">', `<section class="tracker-section" id="map">\n${feedMarkup}`, "map section");
    html = html.replace("</body>", `<a class="client-preview-link" href="#map">Client preview · View open feeds ↗</a>\n</body>`);
  }
  if (/googletagmanager\.com|gtag\('config'|rel="canonical"/.test(html)) throw new Error(`Analytics or canonical remains in ${route}`);
  return html;
}

function transformTracker(raw) {
  let js = raw;
  js = replaceOne(js, 'const mapAssetBase = location.pathname.includes("/source-html/") ? "../assets/" : "assets/";', 'const mapAssetBase = "/assets/";', "map asset base");
  js = replaceOne(js, 'rv: { pathStops: [3, 4, 5, 6], progress: 0.64 }', 'rv: { pathStops: [] }', "fictional RV path");
  js = replaceOne(js, 'const sources = ["assets/us-states-albers-10m.json", "../assets/us-states-albers-10m.json"];', 'const sources = ["/assets/us-states-albers-10m.json"];', "map topology");
  js = replaceOne(js, 'import("/assets/strava-race-map.mjs")', `import("${prefix}/assets/strava-race-map.mjs")`, "isolated module");
  if (!js.includes('const rvMarker = appendImageMarker(svg, svgNS, rvSvgPoint, mapEntityAssets.rv, "rv");')) {
    throw new Error("Approved RV marker source changed");
  }
  js = replaceOne(js, 'appendImageMarker(svg, svgNS, runnerPoint, mapEntityAssets.runner, "runner");', '// A race result is not a current runner coordinate; no position is invented in preview.', "runner marker");
  js = replaceOne(js, 'a[href="/faq/"]', 'a[href="/client-preview/faq/"]', "preview FAQ selector");
  js = replaceOne(js, 'if (snapshot?.source === "api" && snapshot.status.active && missionRaceMapModule)', 'if (snapshot?.source === "api" && missionRaceMapModule)', "race poller");
  js = replaceOne(js, 'onFailure: disableMissionHapn', 'onFailure: () => { updatePreviewFeed("will", "error"); disableMissionHapn(); }', "race error");
  js = replaceOne(js, 'missionRaceStatus = { ...snapshot.status, source: "api" };', 'missionRaceStatus = { ...snapshot.status, source: "api" };\n      updatePreviewFeed("will", snapshot.status.completedRaces > 0 ? "activity" : "empty");', "race status display");
  js = replaceOne(js, 'load: raceMapModule.loadPublicRvLocation,', `load: async () => {
                try {
                  const result = await raceMapModule.loadPublicRvLocation();
                  updatePreviewFeed("rv", !result.available ? "empty" : result.stale ? "stale" : "live");
                  return result;
                } catch (error) {
                  updatePreviewFeed("rv", "error");
                  throw error;
                }
              },`, "RV status display");
  js = replaceOne(js, 'return raceMapModule.loadPublicRaceSnapshot({ staticStops: staticRouteStops });', 'return raceMapModule.loadPublicRaceSnapshot({ staticStops: staticRouteStops }).then((result) => {\n              if (result?.source !== "api") updatePreviewFeed("will", "error");\n              return result;\n            });', "initial race status");
  js = replaceOne(js, 'console.warn("Public race data unavailable; using the static schedule.");', 'console.warn("Public race data unavailable; using the static schedule.");\n            updatePreviewFeed("will", "error");', "race load error");
  js = replaceOne(js, 'return `${RUN_WITH_WILL_FORM_URL}?${params.toString()}`;', 'return "#client-preview-rsvp-disabled";', "RSVP destination");
  const prefixJs = `const previewFeedText = {
  rv: { loading: "Connecting to the RV feed…", live: "Current RV position from the live feed.", stale: "RV last known location is shown on the map. Waiting for a fresh position.", empty: "Feed connected. Waiting for an RV position.", error: "RV feed unavailable. Retrying automatically." },
  will: { loading: "Connecting to the race API…", activity: "Race activity is available from the live API.", empty: "Feed connected. Waiting for Will's first race activity.", error: "Race API unavailable. Showing the planned route." }
};
function updatePreviewFeed(name, state) {
  const panel = document.querySelector('[data-preview-feed="' + name + '"]');
  if (!panel) return;
  panel.dataset.state = state;
  panel.querySelector("span").textContent = previewFeedText[name][state];
}
`;
  return prefixJs + js;
}

function transformRaceModule(raw) {
  let js = raw;
  js = replaceOne(js, 'if (stopped || !lastGoodSnapshot?.status.active || documentObject?.hidden) return;', 'if (stopped || !lastGoodSnapshot || documentObject?.hidden) return;', "preview race polling");
  js = replaceOne(js, 'if (!documentObject?.hidden && lastGoodSnapshot?.status.active) void refresh();', 'if (!documentObject?.hidden && lastGoodSnapshot) void refresh();', "visible race polling");
  const start = js.indexOf('export function hapnLivePositioningEnabled(');
  const end = js.indexOf('\nexport function createPublicRvPoller(', start);
  if (start < 0 || end < 0) throw new Error("RV preview gate source changed");
  js = js.slice(0, start) + `// This module is delivered only under /client-preview/; the production gate stays unchanged.
export function hapnLivePositioningEnabled() { return true; }
` + js.slice(end);
  return js;
}

rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "assets"), { recursive: true });
for (const route of routes) {
  const source = readFileSync(join(root, "preview", "source", `${route}.html`), "utf8");
  const target = route === "index" ? join(output, "index.html") : join(output, route, "index.html");
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, transformHtml(source, route));
}
const productionModule = join(root, "production-merge", "mission-window-alignment-2026-09-09", "public_html", "assets");
writeFileSync(join(output, "assets", "tracker-base.js"), transformTracker(readFileSync(join(productionModule, "tracker-base.js"), "utf8")));
writeFileSync(join(output, "assets", "strava-race-map.mjs"), transformRaceModule(readFileSync(join(productionModule, "strava-race-map.mjs"), "utf8")));
writeFileSync(join(output, ".htaccess"), '<IfModule mod_headers.c>\nHeader always set X-Robots-Tag "noindex, nofollow"\n</IfModule>\n');
console.log(`Built isolated preview: ${routes.length} pages, two preview scripts.`);
