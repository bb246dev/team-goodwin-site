import { contentVersion } from "./version.mjs";

const origin = process.env.PREVIEW_ORIGIN || "https://goodwingoodge.com";
const routes = [
  "", "live-tracking/", "the-run/", "will/", "fifty-runs/", "updates/",
  "faq/", "week-1/", "week-2/", "week-3/", "partners/", "athletes/",
  "privacy/", "terms/", "participation-terms/", "accessibility/",
];
let trackerPath = null;
for (const route of routes) {
  const path = `/client-preview/${route}`;
  const response = await fetch(new URL(path, origin));
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  const html = await response.text();
  if (!response.headers.get("cache-control")?.includes("no-cache")) throw new Error(`${path} must revalidate its HTML`);
  if (!html.includes('<meta name="robots" content="noindex, nofollow">')) throw new Error(`${path} lacks noindex`);
  if (/googletagmanager\.com|gtag\('config'|rel="canonical"/.test(html)) throw new Error(`${path} includes analytics or canonical`);
  if (route === "" && (!html.includes('data-preview-feed="rv"') || !html.includes('data-preview-feed="will"'))) {
    throw new Error("Preview feed panels are missing");
  }
  if (route === "" || route === "live-tracking/") {
    const current = html.match(/src="(\/client-preview\/assets\/tracker-base\.js\?v=([a-f0-9]{64}))"/);
    if (!current) throw new Error(`${path} lacks a content-versioned tracker`);
    if (trackerPath && trackerPath !== current[1]) throw new Error("Preview pages reference different tracker versions");
    trackerPath = current[1];
  }
  console.log(`Verified ${path}`);
}
const trackerResponse = await fetch(new URL(trackerPath, origin));
if (!trackerResponse.ok) throw new Error(`${trackerPath} returned ${trackerResponse.status}`);
const tracker = await trackerResponse.text();
if (contentVersion(tracker) !== new URL(trackerPath, origin).searchParams.get("v")) throw new Error("Preview tracker version does not match its bytes");
const mapImport = tracker.match(/import\("(\/client-preview\/assets\/strava-race-map\.mjs\?v=([a-f0-9]{64}))"\)/);
if (!mapImport) throw new Error("Preview tracker lacks a content-versioned map module");
console.log(`Verified ${trackerPath}`);
const mapPath = mapImport[1];
const mapResponse = await fetch(new URL(mapPath, origin));
if (!mapResponse.ok) throw new Error(`${mapPath} returned ${mapResponse.status}`);
const map = await mapResponse.text();
if (contentVersion(map) !== new URL(mapPath, origin).searchParams.get("v")) throw new Error(`${mapPath} version does not match its bytes`);
if (!map.includes("client-preview")) throw new Error(`${mapPath} is not the isolated preview asset`);
console.log(`Verified ${mapPath}`);
