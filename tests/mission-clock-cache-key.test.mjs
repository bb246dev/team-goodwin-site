import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const baselineHome = readFileSync(new URL("sponsor-release-2026-10-04-index.html", root), "utf8");
const baselineLive = readFileSync(new URL("sponsor-release-2026-10-04-live-tracking.html", root), "utf8");
const candidateHome = readFileSync(new URL("mission-clock-release-2026-10-09-index.html", root), "utf8");
const candidateLive = readFileSync(new URL("mission-clock-release-2026-10-09-live-tracking.html", root), "utf8");
const manifest = JSON.parse(readFileSync(
  new URL("deploy/manifests/releases/mission-clock-cache-key-2026-10-09.json", root),
  "utf8",
));

const hash = (value) => createHash("sha256").update(value).digest("hex");
const newScript = '<script defer src="/assets/tracker-base.js?v=20261009honolulu1500"></script>';

test("homepage changes only the Mission Clock tracker cache key", () => {
  assert.equal(
    candidateHome,
    baselineHome.replace(
      '<script defer src="/assets/tracker-base.js?v=20260930route-itinerary"></script>',
      newScript,
    ),
  );
});

test("live-tracking page changes only the Mission Clock tracker cache key", () => {
  assert.equal(
    candidateLive,
    baselineLive.replace(
      '<script defer src="/assets/tracker-base.js?v=20260831mobile-critical-path"></script>',
      newScript,
    ),
  );
});

test("both routes request the same corrected tracker asset", () => {
  assert.equal(candidateHome, candidateLive);
  assert.match(candidateHome, /tracker-base\.js\?v=20261009honolulu1500/);
  assert.doesNotMatch(candidateHome, /tracker-base\.js\?v=(?:20260930route-itinerary|20260831mobile-critical-path)/);
});

test("cache-key release is pinned to the exact live baselines and new bytes", () => {
  assert.equal(manifest.releaseType, "micro");
  assert.deepEqual(manifest.files.map(({ destination, publicPath }) => ({ destination, publicPath })), [
    { destination: "public_html/index.html", publicPath: "/" },
    { destination: "public_html/live-tracking.html", publicPath: "/live-tracking.html" },
  ]);
  assert.deepEqual(manifest.files.map(({ expectedRemoteSha256 }) => expectedRemoteSha256), [
    hash(baselineHome),
    hash(baselineLive),
  ]);
  assert.deepEqual(manifest.files.map(({ expectedSha256 }) => expectedSha256), [
    hash(candidateHome),
    hash(candidateLive),
  ]);
});
