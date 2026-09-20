import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = join(import.meta.dirname, "source");
const outputRoot = join(import.meta.dirname, "dist", "tracking-preview");
const assetsRoot = join(outputRoot, "assets");
const publicPrefix = "/tracking-preview";

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
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

function actualFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    return entry.isDirectory() ? actualFiles(join(directory, entry.name), `${relative}/`) : [relative];
  });
}

rmSync(join(import.meta.dirname, "dist"), { recursive: true, force: true });
mkdirSync(assetsRoot, { recursive: true });

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
const styles = writeAsset("styles", ".css", `${leafletCss()}\n${readFileSync(join(sourceRoot, "styles.css"), "utf8")}`);

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
html = replaceToken(html, "__STYLE_URL__", styles.url);
html = replaceToken(html, "__APP_URL__", app.url);
writeFileSync(join(outputRoot, "index.html"), html);

const htaccess = `Options -Indexes
DirectoryIndex index.html
<IfModule mod_headers.c>
Header always set X-Robots-Tag "noindex, nofollow"
Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
<FilesMatch "^(index\\.html|asset-manifest\\.json)$">
Header always set Cache-Control "no-cache, must-revalidate"
</FilesMatch>
<FilesMatch "-[a-f0-9]{16}\\.(mjs|css|png)$">
Header always set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>
</IfModule>
`;
writeFileSync(join(outputRoot, ".htaccess"), htaccess);

const assets = [app, feeds, trackingMap, routeData, leaflet, styles, runnerIcon, rvIcon];
const inventory = [
  { path: ".htaccess", url: `${publicPrefix}/.htaccess`, sha256: hash(htaccess), bytes: Buffer.byteLength(htaccess) },
  { path: "index.html", url: `${publicPrefix}/`, sha256: hash(html), bytes: Buffer.byteLength(html) },
  ...assets,
];
const manifest = { prefix: publicPrefix, generatedFiles: inventory };
writeFileSync(join(outputRoot, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const files = actualFiles(outputRoot).sort();
if (files.length !== inventory.length + 1 || !files.includes("asset-manifest.json")) {
  throw new Error("Tracking preview build produced an unexpected inventory");
}
for (const file of files) {
  if (!statSync(join(outputRoot, file)).isFile()) throw new Error(`Unexpected output type: ${file}`);
}
console.log(`Built ${publicPrefix}/ with ${files.length} isolated files.`);
