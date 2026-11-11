import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const indexable = [
  ["index", "/"],
  ["the-run", "/the-run/"],
  ["will", "/will/"],
  ["fifty-runs", "/fifty-runs/"],
  ["week-1", "/week-1/"],
  ["week-2", "/week-2/"],
  ["week-3", "/week-3/"],
  ["faq", "/faq/"],
  ["updates", "/updates/"],
  ["athletes", "/athletes/"],
  ["partners", "/partners/"],
];
const legal = ["privacy", "terms", "participation-terms", "accessibility"];

test("every public content page has complete unique search and social metadata", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const [page, path] of indexable) {
    const html = read(`dist/${page}.html`);
    const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title, `${page}: title`);
    assert.ok(description, `${page}: description`);
    assert.ok(!titles.has(title), `${page}: unique title`);
    assert.ok(!descriptions.has(description), `${page}: unique description`);
    titles.add(title);
    descriptions.add(description);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://goodwingoodge\\.com${path.replaceAll("/", "\\/")}">`));
    assert.match(html, /<meta property="og:title"/);
    assert.match(html, /<meta property="og:image" content="https:\/\/goodwingoodge\.com\/assets\/rebuild\/mission-america-social\.jpg">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<script type="application\/ld\+json">/);
    assert.doesNotMatch(html, /@Lovable|50 Marathons\. 50 States\. 24 Days/i);

    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.doesNotThrow(() => JSON.parse(jsonLd), `${page}: valid JSON-LD`);
  }
});

test("legal and historical policy pages remain available without competing in search", () => {
  for (const page of legal) {
    const html = read(`dist/${page}.html`);
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/goodwingoodge\.com\//);
  }
});

test("sitemap lists only canonical indexable URLs with last modified dates", () => {
  const sitemap = read("dist/sitemap.xml");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls, indexable.map(([, path]) => `https://goodwingoodge.com${path}`));
  assert.equal((sitemap.match(/<lastmod>2026-11-11<\/lastmod>/g) || []).length, indexable.length);
  assert.doesNotMatch(sitemap, /portfolio|\.html|privacy|terms|accessibility/);
  assert.equal(read("dist/robots.txt"), "User-agent: *\nAllow: /\n\nSitemap: https://goodwingoodge.com/sitemap.xml\n");
});

test("retrospective pages no longer advertise a live attempt", () => {
  for (const [page] of indexable) {
    const html = read(`dist/${page}.html`);
    assert.doesNotMatch(html, /24 days|world record attempt|record attempt|follow will|run with will|join the run|running live|subject to independent verification|will will eat|goodwin is coordinating|will has been building|what happens between runs/i, page);
  }
});

test("homepage uses canonical links and responsive legacy photography", () => {
  const html = read("dist/index.html");
  assert.doesNotMatch(html, /href="(?:index|the-run|will|fifty-runs|updates|privacy|terms|accessibility)\.html/);
  assert.match(html, /mission-america-legacy-team-960\.webp 960w/);
  assert.match(html, /mission-america-legacy-team-1600\.webp 1600w/);
  assert.match(html, /decoding="async"/);
});

test("routing policy consolidates host and duplicate document variants", () => {
  const htaccess = read("deploy/retrospective-site.htaccess");
  assert.match(htaccess, /\^www\\\.goodwingoodge\\\.com\$/);
  assert.match(htaccess, /index\\\.html/);
  assert.match(htaccess, /\(\.\+\)\\\.html\$/);
  assert.match(htaccess, /portfolio\/mission-america-2026/);
});

test("local browser assets use compact modern formats without missing fallbacks", () => {
  const interCss = read("dist/fonts/inter.css");
  const offlineCss = read("dist/fonts/offline-fonts.css");
  assert.match(interCss, /inter-latin\.woff2/);
  assert.match(offlineCss, /fraunces-latin\.woff2/);
  assert.doesNotMatch(`${interCss}\n${offlineCss}`, /\.ttf/);
  assert.ok(statSync(new URL("../dist/fonts/inter-latin.woff2", import.meta.url)).size < 60_000);
  assert.ok(statSync(new URL("../dist/fonts/fraunces-latin.woff2", import.meta.url)).size < 60_000);
  assert.ok(existsSync(new URL("../dist/favicon.ico", import.meta.url)));
});
