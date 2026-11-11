import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const source = read("rebuild-homepage.html");
const styles = read("assets/rebuild-homepage.css");
const ambientStyles = read("assets/rebuild-ambient-scroll.css");
const ambientScript = read("assets/rebuild-ambient-scroll.js");
const homepageScript = read("assets/rebuild-homepage.js");
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

test("rebuild homepage presents the confirmed title with the official organization logo and source", () => {
  for (const id of ["home", "record", "story", "goodwin", "legacy"]) {
    assert.match(source, new RegExp(`id="${id}"`));
  }
  assert.match(source, /Mission<br>accomplished</i);
  assert.match(source, /The mission<br>The journey<br>The record</i);
  assert.match(source, /The person<br>inside the miles</i);
  assert.match(source, /Impossible <br>is just a <br>logistics <br>problem</i);
  assert.match(source, /The first chapter<br>is complete</i);
  assert.match(source, /starting lines across Hawaii, Alaska, the mainland, and New York/i);
  assert.match(source, /real&#8209;time operational intelligence/i);
  assert.doesNotMatch(source, /starting lines—|New York—was/i);
  assert.match(source, /“time machines” - turning/);
  assert.doesNotMatch(source, /“time machines”—turning/);
  for (const id of ["hero-title", "story-title", "people-title", "goodwin-title", "legacy-title"]) {
    const headline = source.match(new RegExp(`<h[12] id="${id}">([\\s\\S]*?)<\\/h[12]>`, "i"));
    assert.ok(headline, `missing ${id}`);
    assert.doesNotMatch(headline[1], /\./, `${id} should not end its lines with periods`);
  }
  assert.match(source, /One world record\./i);
  assert.match(source, /achieved the Guinness World Records title/i);
  assert.match(source, /class="record-verification-source"[^>]+guinnessworldrecords\.com\/news\/commercial\/2026\/11\//i);
  assert.match(source, /class="record-verification-copy"[\s\S]*class="record-verification-source"[\s\S]*class="record-verification-logo"/i);
  assert.match(source, /<img class="record-verification-logo" src="assets\/rebuild\/guinness-world-records-logo\.png" alt="Guinness World Records logo"/i);
  assert.equal(content.achievement.verification.logoSourceUrl, "https://www.guinnessworldrecords.com/images/logo.png");
  assert.equal(content.achievement.verification.logoSha256, "8f0002dd46285de911f7eb6d7e394e40c7c8fe690c9c35f34cd36d91e4003f8a");
  assert.ok(existsSync(new URL("../assets/rebuild/guinness-world-records-logo.png", import.meta.url)));
  assert.match(styles, /\.record-verification-source \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) clamp\(62\.4px, 6vw, 81\.6px\)/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.record-verification-source \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 62\.4px/);
  assert.doesNotMatch(styles, /\.record-verification-source \{[^}]*min-height:\s*250px/);
  assert.doesNotMatch(source, /class="section-number"|\b0[1-9]\s*\//i);
  assert.doesNotMatch(source, /class="brand-rule"/i);
  assert.doesNotMatch(source, /legacy-brand/);
  assert.match(styles, /\.brand-mark \{[^}]*display:\s*none;[^}]*grayscale\(1\)[^}]*contrast\(10\)/);
  assert.match(source, /class="brand-wordmark" src="assets\/goodwin-logo\.png" alt=""/);
  assert.match(source, /assets\/rebuild-homepage\.css\?v=20261111-gallery-zoom-2x-v23/);
  assert.match(source, /assets\/rebuild-ambient-scroll\.css\?v=20261109-live-gradient-v1/);
  assert.match(source, /assets\/rebuild-ambient-scroll\.js\?v=20261111-gallery-position-v3/);
  assert.match(styles, /\.brand-wordmark \{[^}]*filter:\s*brightness\(0\) invert\(1\)/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.brand-wordmark \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.brand-mark \{ display: block;/);
  assert.match(styles, /\.record-verification \{[^}]*margin-top:\s*8px;\s*\}/);
  assert.match(styles, /@media \(min-width: 821px\) \{\s*\.record-status \{ display: none; \}\s*\}/);
  assert.match(styles, /@media \(min-width: 821px\) \{[\s\S]*?\.legacy-section::after \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.record-status \{ position: static;/);
  assert.doesNotMatch(styles, /\.record-verification \{[^}]*(?:border|background):/);
  assert.doesNotMatch(source, /class="legacy-copy"[\s\S]*?class="eyebrow"/i);
  assert.doesNotMatch(source, /<figcaption/i);
  assert.doesNotMatch(source, /hero-caption|supplied event photography|photo credit/i);
  assert.doesNotMatch(styles, /\.hero-caption/);
  assert.doesNotMatch(styles, /\.people-card figcaption/);
  assert.doesNotMatch(styles, /\.eyebrow::after/);
  assert.match(styles, /\.section-copy h2 \+ p, \.goodwin-content h2 \+ p, \.legacy-copy h2 \+ p \{ margin-top: 29px; \}/);
  assert.match(styles, /\.story-visual \{[^}]*display: grid;[^}]*grid-template-rows: minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(styles, /\.story-route \{[^}]*position: absolute/);
});

test("mobile navigation follows the full-screen accessible menu pattern", () => {
  assert.match(source, /data-nav-toggle-label>Menu<\/span>/);
  assert.match(source, /aria-controls="primary-navigation"/);
  assert.match(source, /assets\/rebuild-homepage\.js\?v=20261110-mobile-menu-v1/);
  assert.match(styles, /body\.mobile-menu-open \{ overflow: hidden; \}/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.primary-nav \{ position: fixed;[^}]*inset: 0;[^}]*overflow-y: auto;/);
  assert.match(styles, /\.site-header\.nav-open \.primary-nav \{[^}]*visibility: visible;[^}]*pointer-events: auto;/);
  assert.match(homepageScript, /nav\.setAttribute\("role", "dialog"\)/);
  assert.match(homepageScript, /nav\.setAttribute\("aria-modal", "true"\)/);
  assert.match(homepageScript, /region\.inert = shouldOpen/);
  assert.match(homepageScript, /event\.key === "Escape" && open/);
  assert.match(homepageScript, /event\.key !== "Tab" \|\| !open/);
  assert.match(homepageScript, /if \(willOpen\) nav\?\.querySelector\("a"\)\?\.focus\(\)/);
});

test("mobile Goodwin aviation crop keeps the aircraft tail in frame", () => {
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.goodwin-background \{ object-position: 78% 58%; \}/);
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*?\.goodwin-background \{ object-position: 82% center; \}/);
});

test("mobile biography places the selected photo before the headline and copy", () => {
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.people-heading \{ grid-row: 2;/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.people-image \{ grid-row: 1;/);
});

test("mobile legacy section places the revised group photo before its headline", () => {
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.legacy-copy \{ grid-row: 2;/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.legacy-media \{ grid-row: 1;/);
});

test("gallery preview uses the requested image order and verified destination", () => {
  const headlamp = source.indexOf("mission-gallery-headlamp-arizona.jpg");
  const missouri = source.indexOf("mission-gallery-middle-missouri.jpg");
  const hawaiiMotion = source.indexOf("mission-gallery-right-hawaii-motion.jpg");
  assert.ok(headlamp > 0 && headlamp < missouri && missouri < hawaiiMotion);
  const peopleSection = source.indexOf('<section class="people-section"');
  const gallerySection = source.indexOf('<section class="journey-gallery-section"');
  const logisticsSection = source.indexOf('<section class="goodwin-section"');
  assert.ok(peopleSection > 0 && peopleSection < gallerySection && gallerySection < logisticsSection);
  assert.match(source, /<section class="journey-gallery-section"[\s\S]*?<h2[^>]*>50 states<br>One unforgettable journey<\/h2>/);
  assert.match(source, /<a class="journey-gallery-link" href="https:\/\/seanevansphotos\.pixieset\.com\/missionamerica\/" target="_blank" rel="noopener noreferrer">/);
  assert.equal((source.match(/<a class="journey-gallery-card-link" href="https:\/\/seanevansphotos\.pixieset\.com\/missionamerica\/" target="_blank" rel="noopener noreferrer"/g) ?? []).length, 3);
  assert.doesNotMatch(source, /data-gallery-link-pending/);
  assert.match(styles, /\.journey-gallery-strip \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.journey-gallery-strip \{[^}]*margin-right: calc\(var\(--gutter\) \* -1\);[^}]*margin-left: calc\(var\(--gutter\) \* -1\);[^}]*gap: 0;/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.journey-gallery-strip \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*gap: 0;[^}]*overflow: visible;/);
  assert.doesNotMatch(styles, /scroll-snap-type:/);
  assert.doesNotMatch(styles, /overflow-x: auto/);
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*?\.journey-gallery-title \{[^}]*font-size: clamp\(2\.35rem, 10\.4vw, 3\.4rem\);/);
  assert.doesNotMatch(styles, /\.journey-gallery-card:hover img/);
  assert.doesNotMatch(styles, /\.journey-gallery-card img \{[^}]*transition:/);
  assert.match(styles, /\.journey-gallery-card-missouri img \{[^}]*object-position: 50% 50%;[^}]*transform: translate3d\(0, 3\.6%, 0\) scale\(2\);[^}]*transform-origin: 50% 50%;/);
  assert.doesNotMatch(source, />The Goodwin impact\s*</i);
});

test("homepage retains the live site's scrolling ambient gradient behavior", () => {
  assert.match(ambientStyles, /\.ambient-scroll-background \{/);
  assert.match(ambientStyles, /\.ambient-scroll-cloud-one \{/);
  assert.match(ambientStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(ambientScript, /\["#home", DARK\]/);
  assert.match(ambientScript, /\["\.people-section", LIGHT\]/);
  assert.match(ambientScript, /\["\.journey-gallery-section", DARK\]/);
  assert.ok(ambientScript.indexOf('[".people-section", LIGHT]') < ambientScript.indexOf('[".journey-gallery-section", DARK]'));
  assert.ok(ambientScript.indexOf('[".journey-gallery-section", DARK]') < ambientScript.indexOf('["#goodwin", GREEN]'));
  assert.match(ambientScript, /requestAnimationFrame\(render\)/);
  assert.match(ambientScript, /prefers-reduced-motion: reduce/);
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
  assert.match(styles, /--body-copy-size:\s*clamp\(\.98rem, 1\.3vw, 1\.16rem\)/);
  assert.match(styles, /--body-copy-line-height:\s*1\.6/);
  assert.match(styles, /--body-copy-letter-spacing:\s*0/);
  assert.match(styles, /--section-heading-size:\s*clamp\(3rem, 5\.4vw, 6rem\)/);
  assert.match(
    styles,
    /\.section-copy h2, \.people-heading h2, \.goodwin-content h2, \.legacy-copy h2 \{ font-size: var\(--section-heading-size\); line-height: var\(--section-heading-line-height\); \}/,
  );
  assert.doesNotMatch(styles, /font-weight:\s*800/);
  assert.doesNotMatch(styles, /font-style:\s*italic/);
  assert.doesNotMatch(styles, /\.people-heading h2 \{[^}]*font-size/);
  assert.match(
    styles,
    /\.section-copy p, \.people-heading p, \.goodwin-content p, \.legacy-copy p \{[^}]*font-family:\s*var\(--font-sans\);[^}]*font-size:\s*var\(--body-copy-size\);[^}]*font-weight:\s*400;[^}]*line-height:\s*var\(--body-copy-line-height\);[^}]*letter-spacing:\s*var\(--body-copy-letter-spacing\);[^}]*font-kerning:\s*normal;[^}]*font-feature-settings:\s*"kern" 1, "liga" 1;/,
  );
  assert.doesNotMatch(styles, /\.people-heading p:last-child/);
  assert.match(styles, /\.goodwin-content h2 \{ max-width: 830px; text-wrap: balance; \}/);
  assert.match(styles, /\.operations-grid \{[^}]*z-index: 2;[^}]*right: clamp\(22px, 2vw, 32px\);[^}]*bottom: clamp\(22px, 2vw, 32px\);/);
  assert.match(styles, /@media \(min-width: 821px\) \{[\s\S]*?\.operations-grid \{ right: 32px; bottom: 72px; box-shadow: 0 22px 55px rgba\(0,0,0,\.36\); \}/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.goodwin-content h2 \{ font-size: clamp\(2\.45rem, 10vw, 3\.2rem\)/);
  assert.match(source, /<h2 id="goodwin-title">Impossible <br>is just a <br>logistics <br>problem<\/h2>/);
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

test("homepage uses the selected event imagery without film promotion", () => {
  for (const asset of [
    "william-goodge-rhode-island-story-crop.jpg",
    "william-goodge-running.jpeg",
    "william-goodge-delaware-person.jpg",
    "mission-america-legacy-team.jpg",
  ]) {
    assert.match(source, new RegExp(asset.replace(".", "\\.")));
  }
  assert.doesNotMatch(styles, /signal-2026-11-09-132141/);
  assert.doesNotMatch(source, /\bfilm\b/i);
  assert.doesNotMatch(source, /5OW3GNlPP2g|youtube-nocookie|story-film-embed/);
  assert.doesNotMatch(source, /assets\/goodge-website\.mp4/);
  assert.match(source, /class="story-feature-image"[^>]+william-goodge-rhode-island-story-crop\.jpg[^>]+alt="William Goodge running at night during the Mission America Rhode Island stage"/);
  assert.match(styles, /\.story-feature-image \{[^}]*min-height: 720px;[^}]*object-fit: cover;/);
  assert.match(source, /class="people-image"[\s\S]*william-goodge-delaware-person\.jpg[^>]+width="1024" height="768"/);
  assert.doesNotMatch(source, /class="people-gallery"|class="people-card/);
  assert.match(styles, /\.people-image img \{[^}]*object-fit: cover;[^}]*object-position: center;/);
});

test("legacy section uses the supplied Times Square team photograph with a stable responsive crop", () => {
  assert.match(source, /class="legacy-media"[\s\S]*mission-america-legacy-team\.jpg\?v=20261110-revised-v1[^>]+width="3840" height="3052"/);
  assert.doesNotMatch(source, /For Amanda|legacy-purpose/i);
  assert.match(source, /alt="William Goodge and the Mission America team beneath the Goodwin billboard in Times Square"/);
  assert.match(styles, /\.legacy-glow \{ position: absolute; inset: 0; pointer-events: none; \}/);
  assert.match(styles, /\.legacy-media \{[^}]*aspect-ratio: 2400 \/ 1907;/);
  assert.match(styles, /\.legacy-media img \{[^}]*object-fit: cover;[^}]*object-position: center;/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*?\.legacy-media \{ grid-row: 1; min-height: 0; aspect-ratio: 2400 \/ 1907; \}/);
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
    "dist/assets/rebuild-ambient-scroll.css",
    "dist/assets/rebuild-ambient-scroll.js",
    "dist/assets/rebuild/william-goodge-rhode-island-story-crop.jpg",
    "dist/assets/rebuild/william-goodge-running.jpeg",
    "dist/assets/rebuild/william-goodge-delaware-person.jpg",
    "dist/assets/rebuild/guinness-world-records-logo.png",
  ]) assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), asset);
});
