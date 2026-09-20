import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = join(import.meta.dirname, "source");
const productionSourceRoot = join(sourceRoot, "production");
const outputRoot = join(import.meta.dirname, "dist", "tracking-preview");
const assetsRoot = join(outputRoot, "assets");
const publicPrefix = "/tracking-preview";
const productionHomepageSha256 = "4e96d5a878a95e93af6b5cbcd926c2dd56d0d7015f8f2a3bd035fafcc893239f";

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function visit(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    return entry.isDirectory() ? visit(join(directory, entry.name), `${relative}/`) : [relative];
  });
}

function writeOutput(relativePath, content) {
  const destination = join(outputRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { path: relativePath, sha256: hash(bytes), bytes: bytes.length };
}

function writeAsset(name, extension, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const sha256 = hash(bytes);
  const filename = `${name}-${sha256.slice(0, 16)}${extension}`;
  writeFileSync(join(assetsRoot, filename), bytes);
  return { path: `assets/${filename}`, url: `${publicPrefix}/assets/${filename}`, sha256, bytes: bytes.length };
}

function replaceToken(content, token, value) {
  if (!content.includes(token)) throw new Error(`Missing build token: ${token}`);
  return content.replaceAll(token, value);
}

function leafletCss() {
  const bundled = readFileSync(join(repositoryRoot, "assets", "index-CIGW-MKW.css"), "utf8");
  const start = bundled.indexOf(".leaflet-pane");
  const printRule = bundled.indexOf("@media print{.leaflet-control", start);
  const end = bundled.indexOf("}}", printRule);
  if (start !== 0 || printRule < 0 || end < 0) throw new Error("Leaflet CSS source changed");
  return bundled.slice(start, end + 2);
}

function versionedSiteUrl(path, bytes) {
  return `${publicPrefix}/site/${path}?v=${hash(bytes).slice(0, 16)}`;
}

function rewriteCssUrls(css, stylesheetPath, urlByPath) {
  return css.replace(/url\((['"]?)([^)'"?#]+)(?:\?[^)'"#]*)?\1\)/g, (match, _quote, value) => {
    if (/^(?:data:|https?:|#)/i.test(value)) return match;
    const resolved = posix.normalize(posix.join(posix.dirname(stylesheetPath), value));
    const url = urlByPath.get(resolved);
    return url ? `url("${url}")` : match;
  });
}

function rewriteProductionScript(script, urlByPath) {
  let output = script
    .replaceAll('"goodwinSplashSeen"', '"trackingPreview:goodwinSplashSeen"')
    .replaceAll('sessionKey: "missionAmericaIntroSeen"', 'sessionKey: "trackingPreview:missionAmericaIntroSeen"')
    .replaceAll('cacheKey: "goodwin-generated-mission-america-updates-v1"', 'cacheKey: "trackingPreview:goodwin-generated-mission-america-updates-v1"')
    .replaceAll('"mission-follow-emails"', '"trackingPreview:mission-follow-emails"')
    .replaceAll('`mission-comments-${id}`', '`trackingPreview:mission-comments-${id}`');
  for (const path of [...urlByPath.keys()].sort((a, b) => b.length - a.length)) {
    const url = urlByPath.get(path);
    for (const prefix of ["/", "../"]) {
      output = output.replaceAll(`"${prefix}${path}"`, `"${url}"`);
      output = output.replaceAll(`'${prefix}${path}'`, `'${url}'`);
    }
    if (path.startsWith("assets/intro-")) {
      const filename = posix.basename(path);
      const version = hash(readFileSync(join(productionSourceRoot, path))).slice(0, 16);
      output = output.replaceAll(`file: "${filename}"`, `file: "${filename}?v=${version}"`);
    }
  }
  const legacyMapStart = output.indexOf("    const stateAbbr = {");
  const legacyMapEndMarker = "    initMissionMapLoading();";
  const legacyMapEnd = output.indexOf(legacyMapEndMarker, legacyMapStart);
  if (legacyMapStart < 0 || legacyMapEnd < 0) throw new Error("Production legacy map block changed");
  output = output.slice(0, legacyMapStart) + output.slice(legacyMapEnd + legacyMapEndMarker.length);
  output = replaceToken(
    output,
    `    function trackAnalyticsEvent(name, params = {}) {
      try {
        if (typeof window.gtag === "function") {
          window.gtag("event", name, params);
        }
      } catch (error) {
        // Analytics must never interrupt navigation or map interaction.
      }
    }`,
    `    function trackAnalyticsEvent(name, params = {}) {
      void name;
      void params;
    }`,
  );
  return output;
}

function rewriteHtmlAssetUrls(html, urlByPath) {
  let output = html;
  for (const path of [...urlByPath.keys()].sort((a, b) => b.length - a.length)) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`(?:\\.\\.\\/|\\/)${escaped}(?:\\?[^\\s"']*)?`, "g"), urlByPath.get(path));
  }
  return output;
}

function removeProductionAnalytics(html) {
  const withoutAnalytics = html.replace(
    /\n  <script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]+"><\/script>\n  <script>[\s\S]*?gtag\('config', '[^']+'\);\n  <\/script>\n/,
    "\n",
  );
  if (withoutAnalytics === html || /googletagmanager|gtag\(/i.test(withoutAnalytics)) {
    throw new Error("Production analytics removal failed");
  }
  return withoutAnalytics;
}

function removeProductionMapLoader(html) {
  const startMarker = '  <script>\n    (() => {\n      const href = "/assets/index-CIGW-MKW.css";';
  const endMarker = '  <noscript><link rel="stylesheet" href="/assets/index-CIGW-MKW.css"></noscript>\n';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("Production map stylesheet loader changed");
  return html.slice(0, start) + html.slice(end + endMarker.length);
}

function replaceProductionMap(html) {
  const startMarker = '        <div class="tracker-map-stage" aria-label="Goodwin Generated Mission America live map">';
  const endMarker = '        <p class="legal-note">Tracking note: Location and status information may be delayed, approximate or temporarily unavailable. Travel schedules and route information are subject to change.</p>';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("Production map stage changed");
  const replacement = `        <div class="tracker-map-stage tracking-preview-map-stage" aria-label="Goodwin Generated Mission America live map">
          <div class="tracking-preview-feed-grid" aria-label="Public tracking feed status">
            <article class="tracking-preview-feed-card" data-feed="rv" data-state="loading" role="status" aria-live="polite">
              <div class="tracking-preview-feed-title"><span class="tracking-preview-state-dot" aria-hidden="true"></span><strong>RV</strong><span data-feed-state>Connecting</span></div>
              <p data-feed-detail>Connecting to the public RV feed…</p>
            </article>
            <article class="tracking-preview-feed-card" data-feed="will" data-state="loading" role="status" aria-live="polite">
              <div class="tracking-preview-feed-title"><span class="tracking-preview-state-dot" aria-hidden="true"></span><strong>Will</strong><span data-feed-state>Connecting</span></div>
              <p data-feed-detail>Connecting to the public race feed…</p>
            </article>
          </div>
          <div class="tracking-preview-map-controls" data-map-controls role="group" aria-label="Map view controls">
            <button type="button" data-follow="live" aria-pressed="true">Pause Live Follow</button>
            <button type="button" data-follow="will" aria-pressed="false" disabled>Follow Will</button>
            <button type="button" data-follow="rv" aria-pressed="false" disabled>Follow RV</button>
            <button type="button" data-follow="route" aria-pressed="false">Full Route</button>
          </div>
          <div class="tracker-map tracking-preview-map" id="tracking-map" role="region" aria-label="Interactive street map of the Goodwin Generated Mission America route" tabindex="0">
            <span class="tracking-preview-map-loading">Loading countrywide route…</span>
          </div>
          <p class="legal-note tracking-preview-feed-note">The RV and Will interfaces use only the intended public tracking endpoints. Live, last-known, and unavailable states remain explicitly labeled.</p>
        </div>
        <p class="legal-note">Tracking note: Location and status information may be delayed, approximate or temporarily unavailable. Travel schedules and route information are subject to change.</p>`;
  return html.slice(0, start) + replacement + html.slice(end + endMarker.length);
}

rmSync(join(import.meta.dirname, "dist"), { recursive: true, force: true });
mkdirSync(assetsRoot, { recursive: true });

const productionPaths = visit(productionSourceRoot).sort();
const productionRaw = new Map(productionPaths.map((path) => [path, readFileSync(join(productionSourceRoot, path))]));
const rawSiteUrls = new Map([...productionRaw].map(([path, bytes]) => [path, versionedSiteUrl(path, bytes)]));
const productionProcessed = new Map();
for (const [path, bytes] of productionRaw) {
  let content = bytes;
  if (path.endsWith(".css")) content = Buffer.from(rewriteCssUrls(bytes.toString("utf8"), path, rawSiteUrls));
  if (path === "assets/tracker-base.js") content = Buffer.from(rewriteProductionScript(bytes.toString("utf8"), rawSiteUrls));
  productionProcessed.set(path, content);
}
const finalSiteUrls = new Map([...productionProcessed].map(([path, bytes]) => [path, versionedSiteUrl(path, bytes)]));
const productionEntries = [];
for (const [path, bytes] of productionProcessed) {
  const entry = writeOutput(`site/${path}`, bytes);
  productionEntries.push({ ...entry, url: finalSiteUrls.get(path) });
}

const leafletSource = readFileSync(join(repositoryRoot, "assets", "leaflet-src-DNgeFO4O.js"), "utf8");
const standaloneLeaflet = replaceToken(
  leafletSource,
  'import{g as qo}from"./index-CK5luKon.js";',
  'function qo(value){return value&&value.__esModule&&Object.prototype.hasOwnProperty.call(value,"default")?value.default:value}',
);
const leaflet = writeAsset("leaflet", ".mjs", standaloneLeaflet);
const runnerIcon = writeAsset("will-marker", ".png", readFileSync(join(repositoryRoot, "assets", "map-runner-bobblehead-small.png")));
const rvIcon = writeAsset("rv-marker", ".png", readFileSync(join(repositoryRoot, "assets", "map-rv-green-small.png")));
const routeData = writeAsset("route-data", ".mjs", readFileSync(join(sourceRoot, "route-data.mjs")));
const feeds = writeAsset("feeds", ".mjs", readFileSync(join(sourceRoot, "feeds.mjs")));
const trackingMap = writeAsset("tracking-map", ".mjs", readFileSync(join(sourceRoot, "tracking-map.mjs")));
const styles = writeAsset("tracking-preview", ".css", `${leafletCss()}\n${readFileSync(join(sourceRoot, "styles.css"), "utf8")}`);

let appSource = readFileSync(join(sourceRoot, "app.mjs"), "utf8");
for (const [token, value] of [
  ["__ROUTE_DATA_URL__", routeData.url],
  ["__TRACKING_MAP_URL__", trackingMap.url],
  ["__FEEDS_URL__", feeds.url],
  ["__LEAFLET_URL__", leaflet.url],
  ["__WILL_ICON_URL__", runnerIcon.url],
  ["__RV_ICON_URL__", rvIcon.url],
]) appSource = replaceToken(appSource, token, value);
const app = writeAsset("app", ".mjs", appSource);

let html = readFileSync(join(sourceRoot, "index.html"), "utf8");
if (hash(html) !== productionHomepageSha256) throw new Error("Production homepage snapshot no longer matches its approved hash");
html = removeProductionMapLoader(html);
html = removeProductionAnalytics(html);
html = replaceProductionMap(html);
html = rewriteHtmlAssetUrls(html, finalSiteUrls);
html = html.replaceAll('"goodwinSplashSeen"', '"trackingPreview:goodwinSplashSeen"');
html = replaceToken(
  html,
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="robots" content="noindex, nofollow">\n  <meta name="googlebot" content="noindex, nofollow">',
);
html = html.replaceAll('href="/#map"', 'href="#map"');
html = replaceToken(html, "</head>", `  <link rel="stylesheet" href="${styles.url}">\n</head>`);
html = replaceToken(html, "</body>", `  <script type="module" src="${app.url}"></script>\n</body>`);
const htmlEntry = writeOutput("index.html", html);
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)];
if (inlineScripts.length !== 1) throw new Error("Tracking preview has an unexpected executable inline script inventory");
const inlineScriptHash = createHash("sha256").update(inlineScripts[0][1]).digest("base64");

const htaccess = `Options -Indexes
DirectoryIndex index.html
<IfModule mod_headers.c>
Header always set X-Robots-Tag "noindex, nofollow"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-${inlineScriptHash}' https://docs.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org https:; media-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self' https:; frame-ancestors 'none'"
<FilesMatch "^(index\\.html|asset-manifest\\.json)$">
Header always set Cache-Control "no-cache, must-revalidate"
</FilesMatch>
<FilesMatch "\\.(mjs|js|css|png|jpe?g|svg|avif|mp4|woff2)$">
Header always set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>
</IfModule>
`;
const htaccessEntry = writeOutput(".htaccess", htaccess);

const customAssets = [app, feeds, trackingMap, routeData, leaflet, styles, runnerIcon, rvIcon];
const inventory = [
  { ...htaccessEntry, url: `${publicPrefix}/.htaccess` },
  { ...htmlEntry, url: `${publicPrefix}/` },
  ...customAssets,
  ...productionEntries,
];
const manifest = {
  prefix: publicPrefix,
  productionSource: {
    url: "https://goodwingoodge.com/",
    sha256: productionHomepageSha256,
    files: productionPaths.map((path) => ({ path, sha256: hash(productionRaw.get(path)) })),
  },
  generatedFiles: inventory,
};
writeOutput("asset-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

const files = visit(outputRoot).sort();
if (files.length !== inventory.length + 1 || !files.includes("asset-manifest.json")) {
  throw new Error("Tracking preview build produced an unexpected inventory");
}
for (const file of files) {
  if (!statSync(join(outputRoot, file)).isFile()) throw new Error(`Unexpected output type: ${file}`);
}
console.log(`Built a full production-homepage preview at ${publicPrefix}/ with ${files.length} isolated files.`);
