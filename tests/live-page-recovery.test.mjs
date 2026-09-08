import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../source-html/live-tracking.html", import.meta.url), "utf8");
const generated = readFileSync(new URL("../dist/live-tracking.html", import.meta.url), "utf8");

test("hero video and poster survive the offline build", () => {
  assert.match(source, /<video class="tracker-hero-bg"[^>]+autoplay[^>]+muted[^>]+loop[^>]+playsinline[^>]+poster="\.\.\/assets\/hero-runner-Ci5y42DW\.jpg"/);
  assert.match(source, /<source src="\.\.\/assets\/goodge-website\.mp4" type="video\/mp4">/);
  assert.match(generated, /<video class="tracker-hero-bg"[^>]+poster="assets\/hero-runner-Ci5y42DW\.jpg"/);
  assert.match(generated, /<source src="assets\/goodge-website\.mp4" type="video\/mp4">/);
  assert.ok(existsSync(new URL("../dist/assets/goodge-website.mp4", import.meta.url)));
  assert.ok(existsSync(new URL("../dist/assets/hero-runner-Ci5y42DW.jpg", import.meta.url)));
});

test("the original ambient page background implementation remains active", () => {
  assert.match(source, /const MISSION_AMBIENT_BACKGROUND_CONFIG = \{/);
  assert.match(source, /initMobileAmbientBackground\(\);/);
  assert.match(source, /body\.has-mobile-ambient-background \.mobile-ambient-background/);
  assert.doesNotMatch(source, /Simplified editorial system: one page surface/);
});

test("all Inside Goodwin questions remain functional one-at-a-time accordions", () => {
  const desktopTriggers = source.match(/data-inside-desktop-trigger/g) ?? [];
  const mobileTriggers = source.match(/class="inside-accordion-trigger"/g) ?? [];

  assert.equal(desktopTriggers.length, 10, "nine desktop triggers plus the selector in the script");
  assert.equal(mobileTriggers.length, 9);
  assert.match(source, /const openAnswer = \(trigger\) => \{[\s\S]*?closeAll\(\);[\s\S]*?trigger\.setAttribute\("aria-expanded", "true"\);/);
  assert.match(source, /triggers\.forEach\(closePanel\);[\s\S]*?if \(!isOpen\) openPanel\(trigger\);/);

  for (const match of source.matchAll(/<button class="(?:article-card-trigger|inside-accordion-trigger)"[^>]+aria-expanded="false"[^>]+aria-controls="([^"]+)"[^>]+id="([^"]+)"/g)) {
    const [, panelId, triggerId] = match;
    assert.match(source, new RegExp(`id="${panelId}"[^>]+aria-labelledby="${triggerId}"`));
  }
});

test("restored image backgrounds are copied into the generated site", () => {
  for (const file of [
    "road-aerial-DbGvJBXy.jpg",
    "goodge-portrait-BKrZBh3V.jpg",
    "field-notes-week-1-launch.jpg",
    "field-notes-week-2-grind.jpg",
    "field-notes-week-3-finish.jpg",
  ]) {
    assert.ok(existsSync(new URL(`../dist/assets/${file}`, import.meta.url)), file);
  }
});
