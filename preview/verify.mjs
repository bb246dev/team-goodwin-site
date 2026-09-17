const origin = process.env.PREVIEW_ORIGIN || "https://goodwingoodge.com";
const routes = [
  "", "live-tracking/", "the-run/", "will/", "fifty-runs/", "updates/",
  "faq/", "week-1/", "week-2/", "week-3/", "partners/", "athletes/",
  "privacy/", "terms/", "participation-terms/", "accessibility/",
];
for (const route of routes) {
  const path = `/client-preview/${route}`;
  const response = await fetch(new URL(path, origin));
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  const html = await response.text();
  if (!html.includes('<meta name="robots" content="noindex, nofollow">')) throw new Error(`${path} lacks noindex`);
  if (/googletagmanager\.com|gtag\('config'|rel="canonical"/.test(html)) throw new Error(`${path} includes analytics or canonical`);
  if (route === "" && (!html.includes('data-preview-feed="rv"') || !html.includes('data-preview-feed="will"'))) {
    throw new Error("Preview feed panels are missing");
  }
  console.log(`Verified ${path}`);
}
for (const asset of ["tracker-base.js", "strava-race-map.mjs"]) {
  const path = `/client-preview/assets/${asset}`;
  const response = await fetch(new URL(path, origin));
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  const body = await response.text();
  if (!body.includes("client-preview")) throw new Error(`${path} is not the isolated preview asset`);
  console.log(`Verified ${path}`);
}
