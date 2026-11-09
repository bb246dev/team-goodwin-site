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

test("rebuild homepage uses central final event facts and the verified Hawaii route", () => {
  assert.equal(content.achievement.elapsed.display, "22:17:16:34");
  assert.equal(content.achievement.elapsed.status, "guinness-world-record-title-confirmed");
  assert.equal(content.achievement.miles, 1310);
  assert.equal(content.achievement.verification.organization, "Guinness World Records");
  assert.equal(content.achievement.verification.badgeStatus, "licensed-artwork-required");
  assert.equal(content.journey.start.state, "Hawaii");
  assert.equal(content.journey.finish.city, "New York City");
  assert.match(source, /data-content-key="elapsedDisplay">22:17:16:34/);
  assert.match(source, /data-content-key="startLabel">Honolulu, Hawaii · October 9, 2026/);
  assert.doesNotMatch(source, /{{[A-Za-z0-9]+}}/);
  assert.match(build, /renderRebuildHomepage/);
  assert.match(build, /data-content-key/);
});

test("rebuild homepage presents the confirmed title with an official source but no unlicensed badge", () => {
  for (const id of ["home", "record", "story", "goodwin", "film", "legacy"]) {
    assert.match(source, new RegExp(`id="${id}"`));
  }
  assert.match(source, /Mission<br>accomplished\./i);
  assert.match(source, /Impossible is just<br>a logistics problem\./i);
  assert.match(source, /One world record\./i);
  assert.match(source, /achieved the Guinness World Records title/i);
  assert.match(source, /class="record-verification-source"[^>]+guinnessworldrecords\.com\/news\/commercial\/2026\/11\//i);
  assert.match(source, /Insert an official record-holder badge here only when licensed artwork is supplied and approved/);
  assert.doesNotMatch(source, /<img[^>]+(?:guinness|gwr|record-holder-badge)/i);
  assert.doesNotMatch(source, /class="section-number"|\b0[1-9]\s*\//i);
  assert.doesNotMatch(source, /legacy-brand|brand-wordmark/);
  assert.match(styles, /\.brand-mark \{[^}]*grayscale\(1\)[^}]*contrast\(10\)/);
});

test("homepage uses the Goodwin green theme without the previous blue accent system", () => {
  assert.match(styles, /--emerald:\s*#143f3c/);
  assert.match(styles, /--green:\s*#1c6f4a/);
  assert.match(styles, /--sage:\s*#789090/);
  assert.doesNotMatch(styles, /--blue/);
  assert.doesNotMatch(styles, /#4542fb|#5f8cff/i);
  assert.doesNotMatch(source, /blue-rule/);
});

test("homepage typography uses the bundled Inter family without synthetic variants", () => {
  assert.match(styles, /--font-sans:\s*"Inter", Arial, sans-serif/);
  assert.match(styles, /--font-display:\s*"Inter", Arial, sans-serif/);
  assert.match(styles, /--section-heading-size:\s*clamp\(3rem, 5\.4vw, 6rem\)/);
  assert.match(
    styles,
    /\.section-copy h2, \.people-heading h2, \.goodwin-content h2, \.legacy-copy h2 \{ font-size: var\(--section-heading-size\); line-height: var\(--section-heading-line-height\); \}/,
  );
  assert.doesNotMatch(styles, /font-weight:\s*800/);
  assert.doesNotMatch(styles, /font-style:\s*italic/);
  assert.doesNotMatch(styles, /\.people-heading h2 \{[^}]*font-size|\.goodwin-content h2 \{[^}]*font-size/);
});

test("source is readable without running the build and includes completed journey details", () => {
  for (const detail of [
    "1,310",
    "22:17:16:34",
    "October 9, 2026",
    "November 1, 2026",
    "2,361 miles across Australia",
    "3,011 miles from Los Angeles to New York",
    "private aviation, commercial airlines, RV transfers",
  ]) assert.match(source, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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

test("footer retains the original complete mission-partner wall without distorting logos", () => {
  const partnerNames = [
    "Arsenal Aviation",
    "Trilogy Aviation Group",
    "Titan Aviation Group",
    "FLY1200",
    "Jet Excellence",
    "Jet Linx",
    "Skyward Aviation",
    "TrueSkies Aviation Group",
    "Magellan Jets",
    "Charter Flight Support",
    "Spyroll Studios",
    "David",
    "Humantra",
    "Rizkia",
    "WHOOP",
    "Hertz",
    "Bingo Jets",
    "Moxy Hotels",
    "Fontainebleau Miami Beach",
    "Fontainebleau Las Vegas",
    "Real SLX",
    "Skyway Aviation",
  ];
  assert.equal((source.match(/class="partner-logo-item(?: [^"]*)?"/g) || []).length, partnerNames.length);
  for (const name of partnerNames) assert.match(source, new RegExp(`alt="${name} logo"`, "i"));
  assert.match(source, /<footer class="site-footer">[\s\S]*class="site-footer-partners"/);
  assert.match(source, /class="site-footer-main"[\s\S]*class="site-footer-brand"[\s\S]*class="site-footer-nav"/);
  assert.match(source, /class="partner-logo-wall"[\s\S]*class="partner-logo-row-new"/);
  assert.match(styles, /\.site-footer-brand \{ max-width: 260px;/);
  assert.match(styles, /\.site-footer-main \{[^}]*minmax\(220px, \.9fr\)[^}]*minmax\(0, 2\.1fr\)/);
  assert.match(styles, /\.partner-logo-wall \{[^}]*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.partner-logo-item img \{[^}]*width:\s*auto;[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/);
});

test("built review homepage resolves central content and ships its local media", () => {
  assert.match(built, /22:17:16:34/);
  assert.match(built, /1,310/);
  assert.match(built, /Honolulu, Hawaii/);
  assert.match(built, /Guinness World Records title/);
  assert.doesNotMatch(built, /{{[A-Za-z0-9]+}}/);
  assert.match(built, /<nav class="site-footer-nav" aria-label="Footer navigation">/);
  for (const asset of [
    "dist/assets/rebuild-homepage.css",
    "dist/assets/rebuild-homepage.js",
    "dist/assets/rebuild/william-goodge-go-will.jpeg",
    "dist/assets/rebuild/william-goodge-running.jpeg",
    "dist/assets/rebuild/william-goodge-recovery.jpeg",
  ]) assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), asset);
});
