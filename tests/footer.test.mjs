import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const generatedPages = readdirSync(new URL("../dist/", import.meta.url))
  .filter((file) => file.endsWith(".html"));

const expectedSocialLinks = new Map([
  ["Will Goodge on Instagram", "https://www.instagram.com/williamgoodge/"],
  ["Will Goodge on YouTube", "https://www.youtube.com/@goodge"],
  ["Goodwin on LinkedIn", "https://www.linkedin.com/company/teamgoodwin/"],
  ["Goodwin on X", "https://x.com/goteamgoodwin"],
  ["Goodwin on YouTube", "https://www.youtube.com/@goodwinsoftwarecompany"],
]);

test("every generated page contains the accessible social footer", () => {
  for (const file of generatedPages) {
    const html = readFileSync(new URL(`../dist/${file}`, import.meta.url), "utf8");

    assert.match(html, />WILL GOODGE<\/h2>/, file);
    assert.match(html, />GOODWIN<\/h2>/, file);
    assert.doesNotMatch(html, />Will (?:—|&mdash;) (?:Instagram|TikTok|YouTube)</, file);
    assert.doesNotMatch(html, />Goodwin (?:—|&mdash;) (?:LinkedIn|X|YouTube)</, file);

    for (const [label, href] of expectedSocialLinks) {
      const link = html.match(new RegExp(`<a class="footer-social-link" href="([^"]+)" target="_blank" rel="noopener noreferrer" aria-label="${label}">`));
      assert.equal(link?.[1], href, `${file}: ${label}`);
    }

    assert.match(
      html,
      /<span class="footer-social-link footer-social-link-disabled" role="img" aria-label="Will Goodge on TikTok" aria-disabled="true" data-missing-url="tiktok">/,
      `${file}: TikTok remains explicitly unlinked until its real URL is supplied`,
    );

    const icons = html.match(/<svg class="footer-social-icon"[^>]+aria-hidden="true" focusable="false">/g) ?? [];
    assert.equal(icons.length, 6, `${file}: six decorative brand marks`);
  }
});

test("social groups preserve the requested order and text links", () => {
  const html = readFileSync(new URL("../dist/live-tracking.html", import.meta.url), "utf8");
  const willColumn = html.slice(html.indexOf('id="will-goodge-footer-heading"'), html.indexOf('id="goodwin-footer-heading"'));
  const goodwinColumn = html.slice(html.indexOf('id="goodwin-footer-heading"'), html.indexOf('<div class="site-footer-partners"'));

  assert.ok(willColumn.indexOf("Will Goodge on Instagram") < willColumn.indexOf("Will Goodge on TikTok"));
  assert.ok(willColumn.indexOf("Will Goodge on TikTok") < willColumn.indexOf("Will Goodge on YouTube"));
  assert.ok(willColumn.indexOf("WilliamGoodge.com") < willColumn.indexOf("Rizkia"));

  assert.ok(goodwinColumn.indexOf("Goodwin on LinkedIn") < goodwinColumn.indexOf("Goodwin on X"));
  assert.ok(goodwinColumn.indexOf("Goodwin on X") < goodwinColumn.indexOf("Goodwin on YouTube"));
  assert.ok(goodwinColumn.indexOf("TeamGoodwin.com") < goodwinColumn.indexOf("Contact"));
});

test("the original first footer column remains intact before the social columns", () => {
  const html = readFileSync(new URL("../dist/live-tracking.html", import.meta.url), "utf8");
  const footerNav = html.slice(html.indexOf('<nav class="site-footer-nav"'), html.indexOf('<div class="site-footer-partners"'));
  const originalFirstColumn = `<ul class="site-footer-link-group">
              <li><a href="the-run.html">The Run</a></li>
              <li><a href="#map">Live Map</a></li>
              <li><a href="/updates/">Running Live Archive</a></li>
              <li><a href="fifty-runs.html">50 Runs, 50 States</a></li>
            </ul>`;

  assert.match(html, /<div class="site-footer-brand"><img src="assets\/goodwin-logo\.png" alt="Goodwin"><\/div>/);
  assert.ok(footerNav.includes(originalFirstColumn), "the original left-column markup and links are unchanged");
  assert.ok(footerNav.indexOf(originalFirstColumn) < footerNav.indexOf('id="will-goodge-footer-heading"'));
  assert.ok(footerNav.indexOf('id="will-goodge-footer-heading"') < footerNav.indexOf('id="goodwin-footer-heading"'));
  assert.match(html, /\.site-footer-nav > \.site-footer-link-group:first-child a[^}]+color:rgba\(255,255,255,\.72\)/);
});

test("footer icons are locally embedded, white, and touch sized", () => {
  const html = readFileSync(new URL("../dist/live-tracking.html", import.meta.url), "utf8");

  assert.match(html, /\.site-footer,\.global-site-footer\{[^}]+background:#0a0a0a!important/);
  assert.match(html, /\.footer-social-link[^}]+width:44px;height:44px;min-width:44px;min-height:44px/);
  assert.match(html, /\.footer-social-icon[^}]+width:26px;height:26px;color:#fff!important;fill:currentColor!important;stroke:currentColor/);
  assert.match(html, /\.footer-social-icon path[^}]+fill:currentColor!important/);
  assert.match(html, /\.footer-social-link:focus-visible[^}]+outline:2px solid #fff/);
  assert.match(html, /@media\(max-width:640px\)\{\.site-footer \.footer-social-group/);
  assert.doesNotMatch(html, /@media\(max-width:640px\)\{\.site-footer-nav,\.global-site-footer-nav/);
  assert.doesNotMatch(html, /<svg[^>]+(?:src|href)="https?:\/\//);
});

test("the additional sponsor row is local, linked, ordered, and responsive", () => {
  const expectedSponsors = [
    ["Hertz", "https://www.hertz.com/", "hertz-footer.png"],
    ["Bingo Jets", "https://www.bingojets.com/", "bingo-jets-footer.png"],
    ["Moxy Hotels", "https://www.marriott.com/brands/moxy-hotels.mi", "moxy-hotels-footer.svg"],
    ["Fontainebleau Miami Beach", "https://www.fontainebleau.com/miamibeach/", "fontainebleau-miami-beach-footer.svg"],
    ["Fontainebleau Las Vegas", "https://www.fontainebleaulasvegas.com/", "fontainebleau-las-vegas-footer.svg"],
    ["Real SLX", "https://realslx.com/?utm_source=ig&amp;utm_medium=social&amp;utm_content=link_in_bio", "real-slx-footer.svg"],
    ["Skyway Aviation", "https://flyskyway.com/", "skyway-aviation-footer.png"],
  ];

  const html = readFileSync(new URL("../dist/live-tracking.html", import.meta.url), "utf8");
  const rowStart = html.indexOf('<div class="partner-logo-row-new" aria-label="Additional partners">');
  const rowEnd = html.indexOf('<p class="site-footer-partner-disclaimer">', rowStart);
  const row = html.slice(rowStart, rowEnd);
  const wallStart = html.indexOf('<div class="partner-logo-wall">');
  const wall = html.slice(wallStart, rowStart);

  assert.ok(rowStart > wallStart, "new row follows the original sponsor wall");
  assert.ok(rowEnd > rowStart, "new row is inside the sponsor footer");
  assert.equal((row.match(/class="partner-logo-item(?: partner-logo-item-bingo)?"/g) ?? []).length, 7);
  assert.match(wall, /href="https:\/\/www\.jetexcellence\.com\/"[^>]+aria-label="Visit Jet Excellence"/);
  assert.match(wall, /src="assets\/partners\/jet-excellence-footer\.png"[^>]+alt="Jet Excellence logo"/);
  assert.match(html, /img\[src\$="jet-excellence-footer\.png"\][^}]+filter:grayscale\(1\) brightness\(0\) invert\(1\)/);
  assert.equal((html.match(/aria-label="Visit Jet Excellence"/g) ?? []).length, 1, "Jet Excellence replaces FlyExclusive once");
  assert.ok(existsSync(new URL("../dist/assets/partners/jet-excellence-footer.png", import.meta.url)));

  for (const [index, [name, href, asset]] of expectedSponsors.entries()) {
    const sponsorPosition = row.indexOf(`aria-label="Visit ${name}"`);
    assert.ok(sponsorPosition >= 0, `${name}: linked logo exists`);
    if (index > 0) {
      assert.ok(
        sponsorPosition > row.indexOf(`aria-label="Visit ${expectedSponsors[index - 1][0]}"`),
        `${name}: sponsor order`,
      );
    }
    assert.match(row, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `${name}: official link`);
    assert.match(row, new RegExp(`src="assets/partners/${asset.replace(".", "\\.")}"`), `${name}: local asset`);
    assert.ok(existsSync(new URL(`../dist/assets/partners/${asset}`, import.meta.url)), `${name}: copied asset`);
  }

  assert.ok(row.indexOf("Visit Fontainebleau Miami Beach") < row.indexOf("Visit Fontainebleau Las Vegas"), "Fontainebleau properties are adjacent");
  assert.ok(row.indexOf("Visit Fontainebleau Las Vegas") < row.indexOf("Visit Real SLX"), "Real SLX begins the bottom row");
  assert.ok(row.indexOf("Visit Real SLX") < row.indexOf("Visit Skyway Aviation"), "Skyway Aviation shares the bottom row with Real SLX");
  assert.doesNotMatch(html, /flyexclusive/i);
  assert.equal(existsSync(new URL("../dist/assets/partners/flyexclusive-footer.svg", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/assets/partners/flyexclusive.png", import.meta.url)), false);
  assert.match(html, /\.partner-logo-row-new[^}]+grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(html, /\.partner-logo-row-new \.partner-logo-item:nth-child\(6\):nth-last-child\(2\)[^}]+grid-column:2;transform:translateX\(50%\)/);
  assert.match(html, /\.partner-logo-row-new \.partner-logo-item:nth-child\(7\):last-child[^}]+grid-column:4;transform:translateX\(-50%\)/);
  assert.match(html, /\.partner-logo-row-new[^}]+margin-top:34px;padding-top:0/);
  assert.match(html, /\.partner-logo-row-new[^}]+border-top:0/);
  assert.match(html, /@media\(max-width:640px\)[^{]*\{\.site-footer \.partner-logo-row-new[^}]+grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /@media\(max-width:640px\)[^{]*\{\.site-footer \.partner-logo-row-new[^}]+margin-top:28px;padding-top:0;border-top:0/);
  assert.match(html, /\.partner-logo-row-new \.partner-logo-item a:focus-visible[^}]+outline:2px solid #fff/);
});
