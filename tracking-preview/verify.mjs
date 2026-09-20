import { createHash } from "node:crypto";

const origin = process.env.PREVIEW_ORIGIN || "https://goodwingoodge.com";
const rootPath = "/tracking-preview/";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

const publicAssets = manifest.generatedFiles.filter(({ path }) => path.startsWith("assets/"));
if (publicAssets.length !== 8) throw new Error("Tracking preview manifest has an unexpected asset inventory");
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

const productionAssets = manifest.generatedFiles.filter(({ path }) => path.startsWith("site/"));
if (productionAssets.length < 40) throw new Error("Tracking preview lacks the production homepage asset inventory");
for (let index = 0; index < productionAssets.length; index += 8) {
  await Promise.all(productionAssets.slice(index, index + 8).map(async (entry) => {
    if (!entry.url.startsWith(`${rootPath}site/`) || !entry.url.endsWith(`?v=${entry.sha256.slice(0, 16)}`)) {
      throw new Error(`Invalid production asset URL: ${entry.url}`);
    }
    const url = new URL(entry.url, origin);
    const asset = await bytesFor(url, { cache: "no-store" });
    if (!asset.response.headers.get("cache-control")?.includes("immutable")) throw new Error(`${url.pathname} is not immutable`);
    if (sha256(asset.bytes) !== entry.sha256) throw new Error(`${url.pathname} does not match the deployed manifest`);
  }));
}

const htmlAssetUrls = [...html.matchAll(/(?:href|src)="(\/tracking-preview\/assets\/(?:app|tracking-preview)-[a-f0-9]{16}\.(?:mjs|css))"/g)].map((match) => match[1]);
if (htmlAssetUrls.length !== 2 || htmlAssetUrls.some((url) => !publicAssets.some((entry) => entry.url === url))) {
  throw new Error("Tracking preview HTML does not reference the manifest's versioned app and styles assets");
}

const [rvResponse, racesResponse, statusResponse] = await Promise.all([
  fetch(new URL("/strava/public/tracking-status", origin), { cache: "no-store" }),
  fetch(new URL("/strava/public/races", origin), { cache: "no-store" }),
  fetch(new URL("/strava/public/race-status", origin), { cache: "no-store" }),
]);
if (!rvResponse.ok || !racesResponse.ok || !statusResponse.ok) throw new Error("One or more public preview feeds failed verification");
const [rv, races, status] = await Promise.all([rvResponse.json(), racesResponse.json(), statusResponse.json()]);
const rvState = rv.available !== true ? "unavailable" : rv.stale === true ? "stale" : "live";
const willState = !Array.isArray(races.races) ? "unavailable" : status.completedRaces > 0 ? "activity" : "waiting";
console.log(`Verified ${rootPath} normal, returning-browser, and cache-busted requests.`);
console.log(`Public feed states: RV=${rvState}; Will=${willState}; completed=${status.completedRaces}/${status.totalRaces}.`);
