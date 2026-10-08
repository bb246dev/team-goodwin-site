import { createHash } from "node:crypto";

const origin = process.env.PREVIEW_ORIGIN || "https://goodwingoodge.com";
const rootPath = "/tracking-preview/";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function cspSources(csp, directive) {
  const entry = csp.split(";").map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${directive.toLowerCase()} `));
  return entry ? entry.split(/\s+/).slice(1) : [];
}

async function bytesFor(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url.pathname}${url.search} returned ${response.status}`);
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

async function verifyReturningRequest(url, initial) {
  const headers = {};
  const etag = initial.response.headers.get("etag");
  const modified = initial.response.headers.get("last-modified");
  if (etag) headers["If-None-Match"] = etag;
  if (modified) headers["If-Modified-Since"] = modified;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers });
    if (response.status === 304) return;
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (sha256(bytes) === sha256(initial.bytes)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
  }
  throw new Error(`Returning request bytes changed for ${url.pathname}`);
}

async function verifyCacheBusted(url, initial) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const busted = new URL(url);
    busted.searchParams.set("verify", `${Date.now()}-${attempt}`);
    const response = await bytesFor(busted, { cache: "no-store" });
    if (sha256(response.bytes) === sha256(initial.bytes)) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
  }
  throw new Error(`Cache-busted bytes changed for ${url.pathname}`);
}

const pageUrl = new URL(rootPath, origin);
const page = await bytesFor(pageUrl);
const html = page.bytes.toString("utf8");
if (!page.response.headers.get("x-robots-tag")?.includes("noindex")) throw new Error("Tracking preview lacks X-Robots-Tag");
if (!page.response.headers.get("cache-control")?.includes("no-cache")) throw new Error("Tracking preview HTML must revalidate");
if (!html.includes('<meta name="robots" content="noindex, nofollow">')) throw new Error("Tracking preview lacks robots metadata");
if (/googletagmanager|rel=["']canonical|localhost|127\.0\.0\.1/i.test(html)) throw new Error("Tracking preview HTML contains a forbidden production value");
for (const marker of ['id="live"', 'id="the-run"', 'id="map"', 'id="updates"', 'id="articles"', 'id="why"', 'id="rsvp"', 'class="site-footer"']) {
  if (!html.includes(marker)) throw new Error(`Tracking preview is missing production homepage marker ${marker}`);
}
if ((html.match(/class="inside-accordion-trigger"/g) || []).length !== 6) throw new Error("Tracking preview must contain all six Inside GGMA accordions");
if (!html.includes('id="tracking-map"') || html.includes('id="mission-map"')) throw new Error("Tracking preview did not replace the production map stage");
if (!html.includes('data-runner-source="garmin"') || !html.includes("about every 2 minutes")) {
  throw new Error("Full tracking preview is not configured for the bounded Garmin runner feed");
}
await verifyReturningRequest(pageUrl, page);
await verifyCacheBusted(pageUrl, page);

const manifestUrl = new URL(`${rootPath}asset-manifest.json`, origin);
const manifestResponse = await bytesFor(manifestUrl);
const manifest = JSON.parse(manifestResponse.bytes.toString("utf8"));
if (manifest.prefix !== "/tracking-preview" || !Array.isArray(manifest.generatedFiles)) {
  throw new Error("Tracking preview manifest has an invalid deployment prefix");
}
const indexEntry = manifest.generatedFiles.find(({ path }) => path === "index.html");
if (!indexEntry || sha256(page.bytes) !== indexEntry.sha256) throw new Error("Tracking preview HTML does not match the deployed manifest");
await verifyReturningRequest(manifestUrl, manifestResponse);
await verifyCacheBusted(manifestUrl, manifestResponse);

const embedUrl = new URL(`${rootPath}embed/`, origin);
const embed = await bytesFor(embedUrl);
const embedHtml = embed.bytes.toString("utf8");
const embedEntry = manifest.generatedFiles.find(({ path }) => path === "embed/index.html");
if (!embedEntry || sha256(embed.bytes) !== embedEntry.sha256) throw new Error("Tracking preview embed HTML does not match the deployed manifest");
if (!embed.response.headers.get("x-robots-tag")?.includes("noindex")) throw new Error("Tracking preview embed lacks X-Robots-Tag");
if (embed.response.headers.has("x-frame-options")) throw new Error("Tracking preview embed must not send X-Frame-Options");
const embedCsp = embed.response.headers.get("content-security-policy") ?? "";
const embedFrameAncestors = cspSources(embedCsp, "frame-ancestors");
if (!embedFrameAncestors.includes("https://50in24.com") || !embedFrameAncestors.includes("https://www.50in24.com")) {
  throw new Error("Tracking preview embed must lock frame-ancestors to the Command Center origins");
}
if (embedFrameAncestors.includes("https:")) throw new Error("Tracking preview embed must not allow every HTTPS frame ancestor");
if (!embedHtml.includes('class="tracking-preview-embed-page"') || !embedHtml.includes('id="tracking-map"')) {
  throw new Error("Tracking preview embed lacks the map shell");
}
if (!embedHtml.includes('data-runner-source="garmin"') || !embedHtml.includes("about every 2 minutes")) {
  throw new Error("Tracking preview embed is not configured for the bounded Garmin runner feed");
}
if (/tracker-nav|tracker-hero|site-footer|follow-form|googletagmanager|rel=["']canonical|localhost|127\.0\.0\.1/i.test(embedHtml)) {
  throw new Error("Tracking preview embed contains a forbidden full-page value");
}
await verifyReturningRequest(embedUrl, embed);
await verifyCacheBusted(embedUrl, embed);

const inreachIiiUrl = new URL(`${rootPath}inreach-iii/`, origin);
const inreachIii = await bytesFor(inreachIiiUrl);
const inreachIiiHtml = inreachIii.bytes.toString("utf8");
const inreachIiiEntry = manifest.generatedFiles.find(({ path }) => path === "inreach-iii/index.html");
if (!inreachIiiEntry || sha256(inreachIii.bytes) !== inreachIiiEntry.sha256) {
  throw new Error("inReach III embed HTML does not match the deployed manifest");
}
if (!inreachIii.response.headers.get("x-robots-tag")?.includes("noindex")) {
  throw new Error("inReach III embed lacks X-Robots-Tag");
}
if (inreachIii.response.headers.has("x-frame-options")) throw new Error("inReach III embed must not send X-Frame-Options");
const inreachIiiCsp = inreachIii.response.headers.get("content-security-policy") ?? "";
const inreachIiiFrameAncestors = cspSources(inreachIiiCsp, "frame-ancestors");
if (!inreachIiiFrameAncestors.includes("https://50in24.com")
  || !inreachIiiFrameAncestors.includes("https://www.50in24.com")) {
  throw new Error("inReach III embed must lock frame-ancestors to the Command Center origins");
}
if (inreachIiiFrameAncestors.includes("https:")) throw new Error("inReach III embed must not allow every HTTPS frame ancestor");
if (!inreachIiiHtml.includes('data-runner-label="inReach III"')
  || !inreachIiiHtml.includes('data-garmin-only="true"')
  || !inreachIiiHtml.includes('data-follow-zoom="10"')
  || !inreachIiiHtml.includes("https://aus-share.explore.garmin.com/Feed/Share/missionamerica50")) {
  throw new Error("inReach III embed has invalid Garmin-only configuration");
}
if (/data-feed="rv"|data-follow="rv"|tracker-nav|tracker-hero|site-footer|googletagmanager/i.test(inreachIiiHtml)) {
  throw new Error("inReach III embed contains a forbidden non-Garmin-only value");
}
await verifyReturningRequest(inreachIiiUrl, inreachIii);
await verifyCacheBusted(inreachIiiUrl, inreachIii);

const publicAssets = manifest.generatedFiles.filter(({ path }) => path.startsWith("assets/"));
if (publicAssets.length !== 9) throw new Error("Tracking preview manifest has an unexpected asset inventory");
for (const entry of publicAssets) {
  if (!entry.url.startsWith(`${rootPath}assets/`)) throw new Error(`Asset escapes tracking preview: ${entry.url}`);
  const filenameHash = entry.path.match(/-([a-f0-9]{16})\.(?:mjs|css|png)$/)?.[1];
  if (!filenameHash || !entry.sha256.startsWith(filenameHash)) throw new Error(`Invalid content-versioned asset: ${entry.path}`);
  const url = new URL(entry.url, origin);
  const asset = await bytesFor(url);
  if (!asset.response.headers.get("cache-control")?.includes("immutable")) throw new Error(`${url.pathname} is not immutable`);
  if (sha256(asset.bytes) !== entry.sha256) throw new Error(`${url.pathname} does not match the deployed manifest`);
  await verifyReturningRequest(url, asset);
  await verifyCacheBusted(url, asset);
  console.log(`Verified ${url.pathname} sha256:${sha256(asset.bytes)}`);
}

if (manifest.generatedFiles.some(({ path, url }) => path.startsWith("site/") || url.includes(`${rootPath}site/`))) {
  throw new Error("Tracking preview manifest contains a prohibited copied production site tree");
}
if (html.includes(`${rootPath}site/`)) throw new Error("Tracking preview HTML references a prohibited copied production site tree");

const productionAssetPaths = [...new Set(
  [...html.matchAll(/(?:href|src|poster|data-src)=["'](\/(?:assets|fonts)\/[^"']+)["']/g)]
    .map((match) => match[1]),
)];
if (productionAssetPaths.length < 10) throw new Error("Tracking preview lacks production homepage asset references");
for (let index = 0; index < productionAssetPaths.length; index += 8) {
  await Promise.all(productionAssetPaths.slice(index, index + 8).map(async (path) => {
    const asset = await bytesFor(new URL(path, origin), { cache: "no-store" });
    if (asset.bytes.length === 0) throw new Error(`${path} returned an empty production asset`);
  }));
}

const htmlAssetUrls = [...html.matchAll(/(?:href|src)="(\/tracking-preview\/assets\/(?:app|tracking-preview)-[a-f0-9]{16}\.(?:mjs|css))"/g)].map((match) => match[1]);
if (htmlAssetUrls.length !== 2 || htmlAssetUrls.some((url) => !publicAssets.some((entry) => entry.url === url))) {
  throw new Error("Tracking preview HTML does not reference the manifest's versioned app and styles assets");
}

const rvResponse = await fetch(new URL("/strava/public/tracking-status", origin), { cache: "no-store" });
if (!rvResponse.ok) throw new Error("Public RV preview feed failed verification");
const rv = await rvResponse.json();
const rvState = rv.available !== true ? "unavailable" : rv.stale === true ? "stale" : "live";
console.log(`Verified ${rootPath} normal, returning-browser, and cache-busted requests.`);
console.log(`Public feed state: RV=${rvState}; runner source=Garmin KML.`);

const garminLoaderUrl = "https://share.garmin.com/Feed/ShareLoader/missionamerica";
const garminProxyUrl = new URL(`${rootPath}garmin-feed.php`, origin);
garminProxyUrl.searchParams.set("url", garminLoaderUrl);
const garminLoaderResponse = await fetch(garminProxyUrl, { cache: "no-store" });
if (!garminLoaderResponse.ok || !garminLoaderResponse.headers.get("content-type")?.includes("kml+xml")) {
  throw new Error("Tracking preview Garmin proxy failed verification");
}
const garminLoader = await garminLoaderResponse.text();
if (!/<NetworkLink\b/.test(garminLoader) || !/missionamerica/i.test(garminLoader)) {
  throw new Error("Tracking preview Garmin proxy returned an invalid loader");
}
console.log("Verified the isolated Garmin KML proxy and NetworkLink loader.");

const inreachIiiFeedUrl = "https://aus-share.explore.garmin.com/Feed/Share/missionamerica50";
const inreachIiiProxyUrl = new URL(`${rootPath}garmin-feed.php`, origin);
inreachIiiProxyUrl.searchParams.set("url", inreachIiiFeedUrl);
const inreachIiiFeedResponse = await fetch(inreachIiiProxyUrl, { cache: "no-store" });
if (!inreachIiiFeedResponse.ok || !inreachIiiFeedResponse.headers.get("content-type")?.includes("kml+xml")) {
  throw new Error("inReach III Garmin proxy failed verification");
}
const inreachIiiFeed = await inreachIiiFeedResponse.text();
if (!/<Placemark\b/.test(inreachIiiFeed)) throw new Error("inReach III Garmin proxy returned invalid KML");
console.log("Verified the inReach III direct Garmin KML proxy.");
