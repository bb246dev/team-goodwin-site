import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { repairFooter } from "../scripts/build-footer-preview.mjs";

const footerCss = readFileSync(new URL("../assets/footer-social.css", import.meta.url), "utf8");

const originalFooter = `<footer class="site-footer"><nav class="site-footer-nav">
<ul class="site-footer-link-group"><li><a href="/#map">Live Map</a></li></ul>
<ul class="site-footer-link-group"><li><a href="https://www.instagram.com/williamgoodge/">Will's Instagram</a></li></ul>
<ul class="site-footer-link-group"><li><a href="https://www.linkedin.com/company/teamgoodwin/">Goodwin's LinkedIn</a></li></ul>
</nav><div class="site-footer-partners">partner wall remains exact</div></footer>`;
const original = `<!doctype html><html><head><title>Production page</title></head><body><main data-parity="exact">unchanged body</main>${originalFooter}<script>window.mapMustRemainExact=true;</script></body></html>`;

test("footer repair changes only the head stylesheet reference and footer", () => {
  const repaired = repairFooter(original);
  const normalize = (html) => html
    .replace(/\s*<link rel="stylesheet" href="\/assets\/footer-social\.css" data-footer-repair="social-v1">\n?/, "")
    .replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, originalFooter);

  assert.equal(normalize(repaired), original);
  assert.match(repaired, />WILL GOODGE<\/h2>/);
  assert.match(repaired, />GOODWIN<\/h2>/);
  assert.match(repaired, /aria-label="Will Goodge on TikTok"/);
  assert.match(repaired, /https:\/\/www\.tiktok\.com\/@williamgoodge/);
  assert.match(repaired, /partner wall remains exact/);
  assert.match(repaired, /window\.mapMustRemainExact=true/);
});

test("footer repair is idempotent", () => {
  const repaired = repairFooter(original);
  assert.equal(repairFooter(repaired), repaired);
});

test("non-footer documents remain byte-identical", () => {
  const html = "<!doctype html><html><head></head><body>no footer</body></html>";
  assert.equal(repairFooter(html), html);
});

test("malformed production footer fails closed", () => {
  const malformed = original.replace(/<ul class="site-footer-link-group">[\s\S]*?<\/ul>\n/, "");
  assert.throws(() => repairFooter(malformed), /footer_group_count/);
});

test("mobile footer uses two social columns above a full-width two-column navigation", () => {
  assert.match(footerCss, /@media \(max-width: 640px\)/);
  assert.match(footerCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(footerCss, /nth-child\(2\)[\s\S]*?grid-column: 1;\s*grid-row: 1;/);
  assert.match(footerCss, /nth-child\(3\)[\s\S]*?grid-column: 2;\s*grid-row: 1;/);
  assert.match(footerCss, /link-group:first-child[\s\S]*?grid-column: 1 \/ -1;\s*grid-row: 2;/);
  assert.match(footerCss, /\.footer-social-icon,[\s\S]*?width: 20px;\s*height: 20px;/);
  assert.match(footerCss, /\.footer-social-link,[\s\S]*?width: 44px;\s*height: 44px;/);
  assert.match(footerCss, /\.footer-text-links li:first-child a,[\s\S]*?white-space: nowrap;/);
  assert.match(footerCss, /\.footer-social-group,[\s\S]*?align-items: center;[\s\S]*?text-align: center;/);
  assert.match(footerCss, /\.footer-social-links,[\s\S]*?justify-content: center;/);
  assert.doesNotMatch(footerCss, /will-goodge-footer-heading[\s\S]*?li:nth-child\(3\)[\s\S]*?display: none/);
});
