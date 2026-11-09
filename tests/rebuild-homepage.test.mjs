import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const source = read("rebuild-homepage.html");
const styles = read("assets/rebuild-homepage.css");
const build = read("build-offline.mjs");
const content = JSON.parse(read("content/mission-america-2026.json"));
const built = read("dist/index.html");

test("rebuild homepage uses central draft record facts and the verified Hawaii route", () => {
  assert.equal(content.achievement.elapsed.display, "22:17:16:34");
  assert.equal(content.achievement.elapsed.status, "pending-independent-verification");
  assert.equal(content.journey.start.state, "Hawaii");
  assert.equal(content.journey.finish.city, "New York City");
  assert.match(source, /{{elapsedDisplay}}/);
  assert.match(source, /{{startCity}}, {{startState}}/);
  assert.match(build, /renderRebuildHomepage/);
});

test("rebuild homepage follows the required content structure without an unapproved certification badge", () => {
  for (const id of ["home", "record", "story", "goodwin", "film", "legacy"]) {
    assert.match(source, new RegExp(`id="${id}"`));
  }
  assert.match(source, /Mission<br>accomplished\./i);
  assert.match(source, /Impossible is just<br>a logistics problem\./i);
  assert.doesNotMatch(source, /guinness/i);
  assert.doesNotMatch(source, /official world record/i);
});

test("all supplied event photographs are used as individual accessible images", () => {
  for (const asset of [
    "william-goodge-go-will.jpeg",
    "william-goodge-running.jpeg",
    "william-goodge-recovery.jpeg",
  ]) {
    assert.match(source, new RegExp(asset.replace(".", "\\.")));
  }
  assert.doesNotMatch(styles, /signal-2026-11-09-132141/);
});

test("homepage build does not enter the protected portfolio boundary", () => {
  assert.doesNotMatch(build, /rmSync\([^\n]*portfolio\/mission-america-2026/);
  assert.match(source, /portfolio\/mission-america-2026\//);
});

test("built review homepage resolves central content and ships its local media", () => {
  assert.match(built, /22:17:16:34/);
  assert.match(built, /Honolulu, Hawaii/);
  assert.doesNotMatch(built, /{{[A-Za-z0-9]+}}/);
  assert.match(built, /<nav class="footer-nav" aria-label="Footer navigation">/);
  for (const asset of [
    "dist/assets/rebuild-homepage.css",
    "dist/assets/rebuild-homepage.js",
    "dist/assets/rebuild/william-goodge-go-will.jpeg",
    "dist/assets/rebuild/william-goodge-running.jpeg",
    "dist/assets/rebuild/william-goodge-recovery.jpeg",
  ]) assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), asset);
});
