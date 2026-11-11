import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyRetrospectiveLegacyPage, createHistoricalMapRedirectPage } from "../scripts/retrospective-site.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const retainedPages = [
  "accessibility",
  "athletes",
  "faq",
  "fifty-runs",
  "partners",
  "participation-terms",
  "privacy",
  "terms",
  "the-run",
  "updates",
  "week-1",
  "week-2",
  "week-3",
  "will",
];

test("retained production pages are clearly retrospective and remove expired participation links", () => {
  for (const page of retainedPages) {
    const output = applyRetrospectiveLegacyPage(read(`restore-2026-09-30-${page}.html`), `${page}.html`);
    assert.match(output, /data-retrospective-context/);
    assert.match(output, /retrospective-context\.css/);
    assert.match(output, /<base href="\/">/);
    assert.doesNotMatch(output, />Join the Run</i);
    assert.doesNotMatch(output, /world record attempt/i);
    assert.match(output, /portfolio\/mission-america-2026/);
  }
});

test("field notes and photography use captured local data without production polling", () => {
  const updates = applyRetrospectiveLegacyPage(read("restore-2026-09-30-updates.html"), "updates.html");
  assert.match(updates, /FIELD NOTES ARCHIVE/);
  assert.match(updates, /\/assets\/ticker-updates\.json/);
  assert.doesNotMatch(updates, /docs\.google\.com\/spreadsheets/);
  assert.doesNotMatch(updates, /setInterval/);

  const will = applyRetrospectiveLegacyPage(read("restore-2026-09-30-will.html"), "will.html");
  assert.match(will, /Mission America photography/);
  assert.match(will, /renderWillInstagram\(fallbackInstagram\)/);
  assert.doesNotMatch(will, /fetch\("\/api\/instagram-feed"/);
});

test("historical tracker route has a no-live-polling archive fallback", () => {
  const redirect = createHistoricalMapRedirectPage();
  assert.match(redirect, /Live tracking has ended/);
  assert.match(redirect, /portfolio\/mission-america-2026\/live-tracking\.html/);
  assert.doesNotMatch(redirect, /fetch\(|setInterval|WebSocket|EventSource/);
});

test("redirect candidate protects archives, embeds, and backend namespaces", () => {
  const redirects = read("deploy/retrospective-site.htaccess");
  assert.match(redirects, /portfolio\/mission-america-2026\|tracking-preview\|client-preview\|strava\|api/);
  assert.match(redirects, /live-tracking.*portfolio\/mission-america-2026\/live-tracking\.html.*R=301/);
  assert.match(redirects, /REQUEST_FILENAME.*!-f/);
  assert.match(redirects, /REQUEST_FILENAME.*!-d/);
});

test("current homepage removes retired film promotion and maps legacy hashes", () => {
  const homepage = read("rebuild-homepage.html");
  const runtime = read("assets/rebuild-homepage.js");
  assert.doesNotMatch(homepage, /Watch the (?:original|story|full story) film|Original Mission America campaign film|5OW3GNlPP2g|youtube-nocookie/i);
  assert.match(runtime, /#map.*portfolio\/mission-america-2026\/live-tracking\.html/s);
  assert.match(runtime, /#rsvp.*portfolio\/mission-america-2026\//s);
  assert.match(runtime, /#the-run.*#story/s);
});

test("URL inventory documents retained and protected production destinations", () => {
  const inventory = read("docs/mission-america-rebuild-audit-2026-11-09.md");
  for (const route of [
    "/the-run/",
    "/will/",
    "/fifty-runs/",
    "/updates/",
    "/faq/",
    "/athletes/",
    "/partners/",
    "/live-tracking/",
    "/portfolio/mission-america-2026/",
    "/tracking-preview/",
    "/strava/",
    "/api/",
  ]) {
    assert.match(inventory, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("offline build emits the retrospective transform and protected redirect file", () => {
  const build = read("build-offline.mjs");
  assert.match(build, /applyRetrospectiveLegacyPage/);
  assert.match(build, /createHistoricalMapRedirectPage/);
  assert.match(build, /retrospective-site\.htaccess/);
  assert.match(build, /\["index\.html", readFileSync\(join\(dist, "index\.html"\)/);
});

test("clean nested routes use root-scoped local assets", () => {
  const build = read("build-offline.mjs");
  assert.match(build, /function writeNestedPage/);
  assert.match(read("dist/assets/ambient-pages.css"), /\.ambient-pages-background/);
  assert.match(read("dist/assets/ambient-pages.js"), /has-ambient-pages/);
  for (const page of retainedPages) {
    const html = read(`dist/${page}/index.html`);
    assert.doesNotMatch(html, /(?:href|src|poster)=["'](?:assets|fonts)\//, page);
  }
});
