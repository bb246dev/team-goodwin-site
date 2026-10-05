import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { applyApprovedSponsorFooter } from "../scripts/sponsor-footer.mjs";

const pages = [
  "index",
  "accessibility",
  "athletes",
  "faq",
  "fifty-runs",
  "live-tracking",
  "participation-terms",
  "partners",
  "privacy",
  "terms",
  "the-run",
  "updates",
  "week-1",
  "week-2",
  "week-3",
  "will",
];

const expectedSponsors = [
  ["Jet Excellence", "https://www.jetexcellence.com/", "jet-excellence-footer.png"],
  ["Hertz", "https://www.hertz.com/", "hertz-footer.png"],
  ["Bingo Jets", "https://www.bingojets.com/", "bingo-jets-footer.png"],
  ["Moxy Hotels", "https://www.marriott.com/brands/moxy-hotels.mi", "moxy-hotels-footer.svg"],
  ["Fontainebleau Miami Beach", "https://www.fontainebleau.com/miamibeach/", "fontainebleau-miami-beach-footer.svg"],
  ["Fontainebleau Las Vegas", "https://www.fontainebleaulasvegas.com/", "fontainebleau-las-vegas-footer.svg"],
  ["Real SLX", "https://realslx.com/?utm_source=ig&amp;utm_medium=social&amp;utm_content=link_in_bio", "real-slx-footer.svg"],
  ["Skyway Aviation", "https://flyskyway.com/", "skyway-aviation-footer.png"],
];

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("release pages are exact sponsor-only transformations of the restored production bytes", () => {
  for (const page of pages) {
    const restored = readFileSync(new URL(`../restore-2026-09-30-${page}.html`, import.meta.url), "utf8");
    const candidate = readFileSync(new URL(`../sponsor-release-2026-10-04-${page}.html`, import.meta.url), "utf8");
    assert.equal(candidate, applyApprovedSponsorFooter(restored), page);
    assert.equal(applyApprovedSponsorFooter(candidate), candidate, `${page}: transformation is idempotent`);
  }
});

test("the offline builder uses restored production pages instead of stale raw pages", () => {
  const builder = readFileSync(new URL("../build-offline.mjs", import.meta.url), "utf8");
  for (const page of pages) {
    assert.match(builder, new RegExp(`restore-2026-09-30-${page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.html`), page);
  }
  assert.match(builder, /source\.startsWith\("restore-2026-09-30-"\)[\s\S]+applyApprovedSponsorFooter\(html\)/);
  assert.doesNotMatch(builder, /source-html\/index\.raw\.html/);
});

test("every release page contains the approved local sponsor set and responsive layout", () => {
  for (const page of pages) {
    const html = readFileSync(new URL(`../sponsor-release-2026-10-04-${page}.html`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /flyexclusive/i, page);
    assert.equal((html.match(/class="partner-logo-item(?: partner-logo-item-bingo)?"/g) ?? []).length, 22, page);
    assert.equal((html.match(/aria-label="Visit Jet Excellence"/g) ?? []).length, 1, page);
    assert.match(html, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/, `${page}: desktop five-across`);
    assert.match(html, /site-footer-partners\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, `${page}: mobile two-across grid`);
    assert.match(html, /partner-logo-wall[^}]+partner-logo-row-new[^}]+\{display:contents\}/, `${page}: mobile sponsor groups share one continuous grid`);
    assert.match(html, /partner-logo-item:nth-child\(n\)\{grid-column:auto;grid-row:auto;order:initial;transform:none/, `${page}: mobile order remains the source order`);
    for (const [name, href, asset] of expectedSponsors) {
      assert.match(html, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]+aria-label="Visit ${name}"`), `${page}: ${name} link`);
      assert.match(html, new RegExp(`src="/assets/partners/${asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `${page}: ${name} local asset`);
      assert.ok(existsSync(new URL(`../assets/partners/${asset}`, import.meta.url)), `${page}: ${asset} exists`);
    }
  }
});

test("homepage remains the restored Live Tracker page and map references are unchanged", () => {
  const restored = readFileSync(new URL("../restore-2026-09-30-index.html", import.meta.url), "utf8");
  const candidate = readFileSync(new URL("../sponsor-release-2026-10-04-index.html", import.meta.url), "utf8");
  assert.match(candidate, /<title>Goodwin Generated Mission America Live Tracker \| Goodwin<\/title>/);
  assert.match(candidate, /<main class="tracker-page">/);
  assert.match(candidate, /id="mission-map"/);
  for (const reference of ["/assets/tracker-base.js", "/assets/strava-race-map.mjs", "/assets/index-BE9Jl0ji.js"]) {
    assert.equal(candidate.includes(reference), restored.includes(reference), reference);
  }
  assert.notEqual(sha256(candidate), sha256(restored), "footer update changes the page hash");
});

test("release partner metadata matches the approved source metadata", () => {
  const source = readFileSync(new URL("../assets/partners/partners.json", import.meta.url));
  const release = readFileSync(new URL("../assets/releases/sponsor-footer-2026-10-04/partners.json", import.meta.url));
  assert.deepEqual(release, source);
  const entries = JSON.parse(release);
  assert.equal(entries.some(({ slug }) => slug === "flyexclusive"), false);
  for (const slug of ["jet-excellence", "hertz", "bingo-jets", "real-slx", "moxy-hotels", "fontainebleau-miami-beach", "fontainebleau-las-vegas", "skyway-aviation"]) {
    assert.equal(entries.some((entry) => entry.slug === slug), true, slug);
  }
});
