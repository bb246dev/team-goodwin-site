import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const productionIntroAssets = new Map([
  ["intro-dubai-skyline-running.jpg", "d6336beed31e553369dc862549670134785e79f4660f7ed455ec2bd556397641"],
  ["intro-group-running.jpg", "7518ed7a79305199db447fd734b4f305221c9462e5956a0ee6c8be7c7700012d"],
  ["intro-close-portrait.jpg", "7bdc77059c63adf527cc455e323b02fd13404c547aad20913de4dabf4f3d7181"],
  ["intro-fence-stretch.jpg", "a96ead93e0f95d6e044b145c3857973ce7b1e98e88ab29d26e87ad9ab862e93e"],
  ["intro-solo-track-running.jpg", "590d76178b5e4a254ee3c748a6e6fc6cc6e0f6b900166e15fc58f0b0bc25867c"],
]);

const icons = {
  instagram: '<svg class="footer-social-icon" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132z"/></svg>',
  tiktok: '<svg class="footer-social-icon" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path d="M448 209.9a210.1 210.1 0 0 1-122.8-39.2v178.7A162.6 162.6 0 1 1 185 188.3v89.9a74.6 74.6 0 1 0 52.2 71.2V0h88a121.2 121.2 0 0 0 1.9 22.2A122.2 122.2 0 0 0 381 102.4a121.4 121.4 0 0 0 67 20.1z"/></svg>',
  youtube: '<svg class="footer-social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  linkedin: '<svg class="footer-social-icon" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path d="M100.3 448H7.4V148.9h92.9zM53.8 108.1C24.1 108.1 0 84 0 54.3A53.8 53.8 0 0 1 107.6 54.3c0 29.7-24.1 53.8-53.8 53.8zM447.9 448h-92.7V302.4c0-34.7-.7-79.2-48.3-79.2-48.3 0-55.7 37.7-55.7 76.7V448h-92.8V148.9h89.1v40.8h1.3c12.4-23.5 42.7-48.3 87.9-48.3 94 0 111.3 61.9 111.3 142.3V448z"/></svg>',
  x: '<svg class="footer-social-icon" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.8 318.6 106.5 464H35.8l164.9-188.5L26.8 48h145.6l100.5 132.9L389.2 48zM364.4 421.8h39.1L151.1 88h-42l255.4 333.8z"/></svg>',
};

function socialLink(label, href, icon) {
  return `<li><a class="footer-social-link" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${icons[icon]}</a></li>`;
}

function footerColumns(prefix) {
  return [
    `<section class="${prefix}-link-group footer-social-group" aria-labelledby="will-goodge-footer-heading">
          <h2 class="footer-column-heading" id="will-goodge-footer-heading">WILL GOODGE</h2>
          <ul class="footer-social-links" aria-label="Will Goodge social media">
            ${socialLink("Will Goodge on Instagram", "https://www.instagram.com/williamgoodge/", "instagram")}
            ${socialLink("Will Goodge on TikTok", "https://www.tiktok.com/@williamgoodge?_r=1&amp;_t=ZP-99HtuOCkdiA", "tiktok")}
            ${socialLink("Will Goodge on YouTube", "https://www.youtube.com/@goodge", "youtube")}
          </ul>
          <ul class="footer-text-links">
            <li><a href="https://live-mission-america-50.pantheonsite.io/#faq" target="_blank" rel="noopener noreferrer">WilliamGoodge.com</a></li>
            <li><a href="https://rizkia.com/" target="_blank" rel="noopener noreferrer">Rizkia</a></li>
          </ul>
        </section>`,
    `<section class="${prefix}-link-group footer-social-group" aria-labelledby="goodwin-footer-heading">
          <h2 class="footer-column-heading" id="goodwin-footer-heading">GOODWIN</h2>
          <ul class="footer-social-links" aria-label="Goodwin social media">
            ${socialLink("Goodwin on LinkedIn", "https://www.linkedin.com/company/teamgoodwin/", "linkedin")}
            ${socialLink("Goodwin on X", "https://x.com/goteamgoodwin", "x")}
            ${socialLink("Goodwin on YouTube", "https://www.youtube.com/@goodwinsoftwarecompany", "youtube")}
          </ul>
          <ul class="footer-text-links">
            <li><a href="https://teamgoodwin.com/" target="_blank" rel="noopener noreferrer">TeamGoodwin.com</a></li>
            <li><a href="mailto:run@teamgoodwin.com">Contact</a></li>
          </ul>
        </section>`,
  ];
}

export function repairFooter(html) {
  if (html.includes('data-footer-repair="social-v1"')) return html;

  const footerClass = html.includes('<footer class="site-footer">')
    ? "site-footer"
    : html.includes('<footer class="global-site-footer">')
      ? "global-site-footer"
      : null;
  if (!footerClass) return html;

  const footerStart = html.indexOf(`<footer class="${footerClass}">`);
  const footerEnd = html.indexOf("</footer>", footerStart);
  if (footerEnd === -1) throw new Error("footer_close_missing");

  const prefix = footerClass;
  const groupPattern = new RegExp(`<ul class="${prefix}-link-group">(?:(?!<\\/ul>)[\\s\\S])*?<\\/ul>`, "g");
  const footer = html.slice(footerStart, footerEnd + "</footer>".length);
  const groups = [...footer.matchAll(groupPattern)];
  if (groups.length !== 3) throw new Error(`footer_group_count:${basename(footerClass)}:${groups.length}`);

  const [willColumn, goodwinColumn] = footerColumns(prefix);
  let repairedFooter = footer;
  repairedFooter = repairedFooter.replace(groups[2][0], goodwinColumn);
  repairedFooter = repairedFooter.replace(groups[1][0], willColumn);

  const stylesheet = '  <link rel="stylesheet" href="/assets/footer-social.css" data-footer-repair="social-v1">\n';
  return html
    .slice(0, footerStart)
    .replace("</head>", `${stylesheet}</head>`)
    .concat(repairedFooter, html.slice(footerEnd + "</footer>".length));
}

function htmlFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? htmlFiles(path) : path.endsWith(".html") ? [path] : [];
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function buildFooterPreview({ source, target, hapnAssets, introAssets }) {
  cpSync(source, target, { recursive: true, force: true });
  mkdirSync(join(target, "assets"), { recursive: true });
  cpSync(join(root, "assets", "footer-social.css"), join(target, "assets", "footer-social.css"));

  if (hapnAssets) {
    for (const name of ["tracker-base.js", "strava-race-map.mjs"]) {
      cpSync(join(hapnAssets, name), join(target, "assets", name));
    }
  }

  if (introAssets) {
    for (const [name, expectedHash] of productionIntroAssets) {
      const sourcePath = join(introAssets, name);
      if (sha256(sourcePath) !== expectedHash) throw new Error(`production_intro_asset_mismatch:${name}`);
      cpSync(sourcePath, join(target, "assets", name));
    }
  }

  let changed = 0;
  for (const path of htmlFiles(target)) {
    const html = readFileSync(path, "utf8");
    const repaired = repairFooter(html);
    if (repaired !== html) {
      writeFileSync(path, repaired);
      changed += 1;
    }
  }
  return { changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, target, hapnAssets, introAssets] = process.argv.slice(2).map((path) => path && resolve(path));
  if (!source || !target) {
    throw new Error("usage: node scripts/build-footer-preview.mjs SOURCE TARGET [HAPN_ASSET_DIR] [PRODUCTION_INTRO_ASSET_DIR]");
  }
  const result = buildFooterPreview({ source, target, hapnAssets, introAssets });
  console.log(`footer preview: ${result.changed} HTML files patched in ${target}`);
}
