import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baseline = read("assets/releases/live-map-rv-plane-markers-2026-10-05/tracker-base.js");
const candidatePath = "assets/releases/live-map-layout-2026-10-05/tracker-base.js";
const candidate = read(candidatePath);
const manifest = JSON.parse(read("deploy/manifests/releases/live-map-layout-2026-10-05.json"));

const startMarker = "\n    function initLiveMapLayoutFix() {";
const callMarker = "\n    initLiveMapLayoutFix();";
const layoutStart = candidate.indexOf(startMarker);
const layoutEnd = candidate.indexOf(callMarker, layoutStart) + callMarker.length;

test("candidate is the deployed tracker baseline plus only the live-map layout fix", () => {
  assert.ok(layoutStart >= 0, "missing layout fix function");
  assert.ok(layoutEnd > callMarker.length, "missing layout fix invocation");
  const restoredBaseline = candidate.slice(0, layoutStart) + candidate.slice(layoutEnd + 1);
  assert.equal(restoredBaseline, baseline);
});

test("layout fix removes the extra stage row while keeping the key visible", () => {
  const layoutFix = candidate.slice(layoutStart, layoutEnd);
  assert.match(layoutFix, /new Set\(\["\/", "\/live-tracking\.html", "\/live-tracking\/"\]\)/);
  assert.match(layoutFix, /#map > \.tracker-map-stage\.is-live-map-layout-fixed > \.tracker-map > svg/);
  assert.match(layoutFix, /height: calc\(100% - var\(--tracking-map-key-height\)\)/);
  assert.match(layoutFix, /> \.tracking-map-key \{[\s\S]*position: absolute;[\s\S]*bottom: 0;/);
  assert.match(layoutFix, /getBoundingClientRect\(\)\.height/);
  assert.match(layoutFix, /new ResizeObserver\(syncKeyHeight\)\.observe\(key\)/);
  assert.doesNotMatch(layoutFix, /tracking-map-key[\s\S]{0,120}(?:display:\s*none|visibility:\s*hidden)/);
});

test("tracking note is adjacent to the live map, centered, and has no added gap", () => {
  const layoutFix = candidate.slice(layoutStart, layoutEnd);
  assert.match(layoutFix, /const trackingNote = stage\?\.nextElementSibling/);
  assert.match(layoutFix, /trackingNote\?\.classList\.contains\("legal-note"\)/);
  assert.match(layoutFix, /#map > \.tracker-map-note \{[\s\S]*margin-top: 0;[\s\S]*text-align: center;/);
});

test("marker gates, flight paths, legend, and visible race times are unchanged", () => {
  assert.match(candidate, /const RV_MAP_VISIBLE_FROM = Date\.parse\("2026-10-11T06:00:00-07:00"\)/);
  assert.match(candidate, /\(flight\.active !== true && flight\.active !== "true"\) \|\| flight\.status !== "IN TRANSIT"/);
  assert.equal((candidate.match(/class", "map-route flight"/g) || []).length, 1);
  assert.match(candidate, /node\.textContent\.trim\(\) === "Runner"\) node\.textContent = "Will"/);
  assert.doesNotMatch(candidate.slice(layoutStart, layoutEnd), /key\.(?:textContent|innerHTML|replaceChildren)\s*[=(]/);
  assert.match(candidate, /city: "Los Angeles"[^\n]+scheduledStart: "2026-10-20T22:45:00-07:00"/);
  assert.match(candidate, /city: "Portsmouth"[^\n]+scheduledStart: "2026-10-31T05:00:00-04:00"/);
  assert.match(candidate, /city: "Kittery"[^\n]+scheduledStart: "2026-10-31T12:00:00-04:00"/);
});

test("manifest deploys only the tracker with exact old and new hashes", () => {
  assert.equal(sha256(candidate), "a34af9a8f8311a1a6dc060206a04534fb59a7f14ca76b22f42ea9df5ee3f664f");
  assert.deepEqual(manifest.protectedPathsApproved, ["public_html/assets/tracker-base.js"]);
  assert.deepEqual(manifest.files, [{
    source: candidatePath,
    destination: "public_html/assets/tracker-base.js",
    publicPath: "/assets/tracker-base.js",
    expectedSha256: sha256(candidate),
    expectedRemoteSha256: "6281c0d6c81a91b9d888503514bc2ab9a1bd33807b3690306fd5c6d3a7bc7394",
  }]);
  assert.deepEqual(manifest.validation.browserRoutes, ["/", "/live-tracking.html", "/live-tracking/"]);
  const deployedFiles = JSON.stringify(manifest.files);
  assert.doesNotMatch(deployedFiles, /tracking-preview|client-preview|footer|sponsor|\.css|\.(?:png|jpe?g|svg)|\.htaccess|frame-ancestors|flightaware|hapn/i);
});
