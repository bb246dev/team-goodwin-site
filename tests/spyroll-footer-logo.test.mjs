import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const sourceFiles = [
  "live-tracking.html",
  "faq.raw.html",
  "updates.raw.html",
  "privacy.raw.html",
  "terms.raw.html",
  "participation-terms.raw.html",
  "accessibility.raw.html",
];
const oldAsset = "spyroll-studios-footer.svg";
const canonicalAsset = "spyroll-studios-logo.avif";
const stylesheet = '<link rel="stylesheet" href="/assets/spyroll-footer-logo.css">';
const expectedAssetHash = "d46ed2996f1e1bc21a3ce5c489055cd03216b95484caecedf2e1ccfc79ad4aa5";

function count(value, needle) {
  return value.split(needle).length - 1;
}

test("every source file that owns Spyroll footer markup uses the canonical logo", () => {
  for (const filename of sourceFiles) {
    const source = readFileSync(new URL(`../source-html/${filename}`, import.meta.url), "utf8");
    assert.equal(count(source, oldAsset), 0, `${filename}: old Spyroll reference`);
    assert.equal(count(source, canonicalAsset), 1, `${filename}: canonical Spyroll reference`);
    assert.equal(count(source, stylesheet), 1, `${filename}: Spyroll stylesheet reference`);
  }
});

test("canonical asset is the exact approved 491 by 104 AVIF", () => {
  const asset = readFileSync(new URL("../assets/partners/spyroll-studios-logo.avif", import.meta.url));
  assert.equal(createHash("sha256").update(asset).digest("hex"), expectedAssetHash);
  const ispe = asset.indexOf(Buffer.from("ispe"));
  assert.ok(ispe >= 0, "AVIF spatial extents box");
  assert.equal(asset.readUInt32BE(ispe + 8), 491);
  assert.equal(asset.readUInt32BE(ispe + 12), 104);
});

test("Spyroll-only sizing preserves the approved scale without centering offsets", () => {
  const css = readFileSync(new URL("../assets/spyroll-footer-logo.css", import.meta.url), "utf8");
  assert.match(css, /\.partner-logo-item:has\(> a\[aria-label="Visit Spyroll Studios"\]\) \{\s*width: 100%;/);
  assert.match(css, /a\[aria-label="Visit Spyroll Studios"\] \{\s*width: min\(143\.042775px, 85\.144509%\);/);
  assert.match(css, /a\[aria-label="Visit Spyroll Studios"\] img \{\s*width: 100%;\s*max-width: none;\s*height: auto;/);
  assert.match(css, /width: min\(78\.332948px, 85\.144509%\);/);
  assert.match(css, /width: min\(112\.390751px, 85\.144509%\);/);
  assert.doesNotMatch(css, /(?:justify-content|margin-inline|translate|position\s*:|transform\s*:)/i);
});

test("partner metadata points to the canonical approved asset", () => {
  const partners = JSON.parse(readFileSync(new URL("../assets/partners/partners.json", import.meta.url), "utf8"));
  const spyroll = partners.find(({ slug }) => slug === "spyroll-studios");
  assert.equal(spyroll.footerAsset, "/assets/partners/spyroll-studios-logo.avif");
});
