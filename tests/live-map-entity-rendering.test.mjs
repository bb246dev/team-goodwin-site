import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseUrl = new URL(
  "../production-merge/hapn-api2-production-base-patch-2026-09-09/public_html/assets/tracker-base.js",
  import.meta.url,
);
const candidateUrl = new URL(
  "../production-merge/live-map-entity-rendering-2026-09-09/public_html/assets/tracker-base.js",
  import.meta.url,
);
const moduleUrl = new URL(
  "../production-merge/hapn-api2-production-base-patch-2026-09-09/public_html/assets/strava-race-map.mjs",
  import.meta.url,
);
const base = readFileSync(baseUrl, "utf8");
const candidate = readFileSync(candidateUrl, "utf8");
const moduleSource = readFileSync(moduleUrl, "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");

function functionExpression(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return `(${source.slice(start, index + 1)})`;
  }
  throw new Error(`unterminated function ${name}`);
}

const projectLower48 = Function(`return ${functionExpression(candidate, "projectLower48")}`)();
const display = ([x, y]) => [x * 0.88 + 105, y * 0.88 + 35];
const projected = (lat, lng) => display(projectLower48(lat, lng));

const controls = {
  Columbus: [39.9612, -82.9988],
  Cincinnati: [39.1031, -84.512],
  Cleveland: [41.4993, -81.6944],
  Toledo: [41.6528, -83.5379],
  Seattle: [47.6062, -122.3321],
  "Los Angeles": [34.0522, -118.2437],
  Dallas: [32.7767, -96.797],
  Chicago: [41.8781, -87.6298],
  "New York": [40.7128, -74.006],
  Miami: [25.7617, -80.1918],
};
const points = Object.fromEntries(
  Object.entries(controls).map(([name, [lat, lng]]) => [name, projected(lat, lng)]),
);

test("candidate starts from the exact live tracker and changes no Strava runtime", () => {
  assert.equal(hash(base), "570b8f8431f2202b383d5ce7b74f1027e9dd35ef66adb94a57568f2ed7c26931");
  assert.equal(hash(moduleSource), "4d8b6e1b33b701651fa5219e5a12736dee5d0605ac7810fa8a1d1eb427629dae");
});

test("map key is Will while moving entity markers render images only", () => {
  assert.match(candidate, /node\.textContent\.trim\(\) === "Runner"\) node\.textContent = "Will"/);
  assert.match(candidate, /function appendImageMarker\(svg, svgNS, point, imageHref, className\)/);
  assert.match(candidate, /group\.append\(image\);/);
  assert.doesNotMatch(functionExpression(candidate, "appendImageMarker"), /createElementNS\(svgNS, "text"\)|map-entity-label/);
  assert.match(candidate, /mapEntityAssets\.rv, "rv"\)/);
  assert.match(candidate, /mapEntityAssets\.runner, "runner"\)/);
});

test("RV uses the approved uncropped frame and centered aspect-ratio fit", () => {
  const marker = functionExpression(candidate, "appendImageMarker");
  assert.match(marker, /className === "rv"[\s\S]*\{ x: -30, y: -20, width: 60, height: 40 \}/);
  assert.match(marker, /className === "runner" \|\| className === "rv" \? "xMidYMid meet"/);
});

test("geoAlbersUsa controls match the topology and retain correct relative geography", () => {
  const expected = {
    Columbus: [739.8055444085411, 264.5441900511538],
    Cincinnati: [719.1339173176428, 284.66077954050354],
    Cleveland: [754.7382524631217, 231.08962407880526],
    Toledo: [727.2501235774342, 231.86710567290473],
    Seattle: [190.90997091300756, 75.76042012238008],
    "Los Angeles": [181.3946751240884, 354.5446142848962],
    Dallas: [529.9595633780314, 422.66983526578326],
    Chicago: [666.6332616974609, 233.97879305186092],
    "New York": [870.3525132175353, 224.85165924824963],
    Miami: [829.0097179301915, 538.8358856192899],
  };
  for (const [name, point] of Object.entries(points)) {
    assert.ok(Math.hypot(point[0] - expected[name][0], point[1] - expected[name][1]) < 1e-9, name);
  }
  assert.ok(points.Cincinnati[0] < points.Columbus[0] && points.Cincinnati[1] > points.Columbus[1]);
  assert.ok(points.Toledo[0] < points.Columbus[0] && points.Toledo[1] < points.Columbus[1]);
  assert.ok(points.Cleveland[0] > points.Columbus[0] && points.Cleveland[1] < points.Columbus[1]);
  assert.ok(points.Seattle[1] < points["Los Angeles"][1]);
  assert.ok(points["Los Angeles"][0] < points.Dallas[0] && points.Dallas[0] < points.Chicago[0]);
  assert.ok(points.Chicago[0] < points["New York"][0] && points.Miami[1] > points["New York"][1]);
});

test("the HAPN control is nearly coincident with Columbus without provider changes", () => {
  const hapn = projected(39.998, -83);
  assert.ok(Math.hypot(hapn[0] - points.Columbus[0], hapn[1] - points.Columbus[1]) < 1);
  assert.match(moduleSource, /export const HAPN_REFRESH_MS = 120_000/);
  assert.match(moduleSource, /PUBLIC_RV_LOCATION_ENDPOINT = "\/strava\/public\/tracking-status"/);
});

test("release excludes dry-run controls, diagnostics, and deferred API priority", () => {
  assert.doesNotMatch(candidate, /FOLLOW RV|STREET TEST|SHOW FULL ROUTE|previous-position|geo-diagnostic|simulated clock|15-second|API #3|tiered API priority/i);
  assert.doesNotMatch(candidate, /GOODWIN_LOCAL|local-dry-run|data-dry-run|__GOODWIN_LOCAL/i);
  assert.equal((candidate.match(/\{ n: \d+, state:/g) || []).length, 50);
  assert.equal((candidate.match(/\{ fromStop: \d+, toStop: \d+/g) || []).length, 5);
  assert.match(candidate, /topo\.objects\.states\.geometries\.forEach/);
  assert.match(candidate, /rootMargin: "700px 0px"/);
});
