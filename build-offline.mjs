import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, "assets"), join(dist, "assets"), { recursive: true });
cpSync(join(root, "fonts"), join(dist, "fonts"), { recursive: true });
if (existsSync(join(root, "api"))) {
  cpSync(join(root, "api"), join(dist, "api"), {
    recursive: true,
    // Strava modules are server-only and must not enter the static export.
    filter: (path) => !/[/\\]strava(?:[-.]|$)/.test(path),
  });
}

const pages = [
  ["source-html/index.raw.html", "index.html"],
  ["source-html/athletes.raw.html", "athletes.html"],
  ["source-html/partners.raw.html", "partners.html"],
  ["source-html/live-tracking.html", "live-tracking.html"],
  ["source-html/live-tracking-gradient.html", "live-tracking-gradient.html"],
  ["source-html/live-tracking-gradient-compression.html", "live-tracking-gradient-compression.html"],
  ["source-html/live-tracking-gradient-benchmark-2026-08-30.html", "live-tracking-gradient-benchmark-2026-08-30.html"],
  ["source-html/live-tracking-gradient-benchmark-sage-2026-08-30.html", "live-tracking-gradient-benchmark-sage-2026-08-30.html"],
  ["source-html/the-run.raw.html", "the-run.html"],
  ["source-html/will.raw.html", "will.html"],
  ["source-html/fifty-runs.raw.html", "fifty-runs.html"],
  ["source-html/updates.raw.html", "updates.html"],
  ["source-html/faq.raw.html", "faq.html"],
  ["source-html/week-1.raw.html", "week-1.html"],
  ["source-html/week-2.raw.html", "week-2.html"],
  ["source-html/week-3.raw.html", "week-3.html"],
  ["source-html/privacy.raw.html", "privacy.html"],
  ["source-html/terms.raw.html", "terms.html"],
  ["source-html/participation-terms.raw.html", "participation-terms.html"],
  ["source-html/accessibility.raw.html", "accessibility.html"],
];

const videoIds = [
  "n4ryq66g73w",
  "0pSyTZX-W_k",
  "fmmMVWg0PSM",
  "OHphcj4Iyr0",
  "tjtq4HcwsHA",
  "uhlS676VCBQ",
  "6WUDZK1pE4s",
  "infIn5eDK1o",
  "T6YC-CgVOvo",
  "epjHuFVRMGs",
  "ApDPZUyHV6Y",
  "CupDgn2O1Vw",
];

// Social marks are embedded from Font Awesome Free Brands and Simple Icons so
// the footer has no runtime icon or CDN dependency. Each SVG is decorative
// inside its labelled link (or, for the missing TikTok destination, its
// labelled disabled item).
const socialIconSvg = {
  instagram: `<svg class="footer-social-icon" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132z"/></svg>`,
  tiktok: `<svg class="footer-social-icon" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path d="M448 209.9a210.1 210.1 0 0 1-122.8-39.2v178.7A162.6 162.6 0 1 1 185 188.3v89.9a74.6 74.6 0 1 0 52.2 71.2V0h88a121.2 121.2 0 0 0 1.9 22.2A122.2 122.2 0 0 0 381 102.4a121.4 121.4 0 0 0 67 20.1z"/></svg>`,
  youtube: `<svg class="footer-social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  linkedin: `<svg class="footer-social-icon" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path d="M100.3 448H7.4V148.9h92.9zM53.8 108.1C24.1 108.1 0 84 0 54.3A53.8 53.8 0 0 1 107.6 54.3c0 29.7-24.1 53.8-53.8 53.8zM447.9 448h-92.7V302.4c0-34.7-.7-79.2-48.3-79.2-48.3 0-55.7 37.7-55.7 76.7V448h-92.8V148.9h89.1v40.8h1.3c12.4-23.5 42.7-48.3 87.9-48.3 94 0 111.3 61.9 111.3 142.3V448z"/></svg>`,
  x: `<svg class="footer-social-icon" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.8 318.6 106.5 464H35.8l164.9-188.5L26.8 48h145.6l100.5 132.9L389.2 48zM364.4 421.8h39.1L151.1 88h-42l255.4 333.8z"/></svg>`,
};

const willGoodgeFooterColumn = `<section class="site-footer-link-group footer-social-group" aria-labelledby="will-goodge-footer-heading">
            <h2 class="footer-column-heading" id="will-goodge-footer-heading">WILL GOODGE</h2>
            <ul class="footer-social-links" aria-label="Will Goodge social media">
              <li><a class="footer-social-link" href="https://www.instagram.com/williamgoodge/" target="_blank" rel="noopener noreferrer" aria-label="Will Goodge on Instagram">${socialIconSvg.instagram}</a></li>
              <li><span class="footer-social-link footer-social-link-disabled" role="img" aria-label="Will Goodge on TikTok" aria-disabled="true" data-missing-url="tiktok">${socialIconSvg.tiktok}</span></li>
              <li><a class="footer-social-link" href="https://www.youtube.com/@goodge" target="_blank" rel="noopener noreferrer" aria-label="Will Goodge on YouTube">${socialIconSvg.youtube}</a></li>
            </ul>
            <ul class="footer-text-links">
              <li><a href="https://live-mission-america-50.pantheonsite.io/#faq" target="_blank" rel="noopener noreferrer">WilliamGoodge.com</a></li>
              <li><a href="https://rizkia.com/" target="_blank" rel="noopener noreferrer">Rizkia</a></li>
            </ul>
          </section>`;

const goodwinFooterColumn = `<section class="site-footer-link-group footer-social-group" aria-labelledby="goodwin-footer-heading">
            <h2 class="footer-column-heading" id="goodwin-footer-heading">GOODWIN</h2>
            <ul class="footer-social-links" aria-label="Goodwin social media">
              <li><a class="footer-social-link" href="https://www.linkedin.com/company/teamgoodwin/" target="_blank" rel="noopener noreferrer" aria-label="Goodwin on LinkedIn">${socialIconSvg.linkedin}</a></li>
              <li><a class="footer-social-link" href="https://x.com/goteamgoodwin" target="_blank" rel="noopener noreferrer" aria-label="Goodwin on X">${socialIconSvg.x}</a></li>
              <li><a class="footer-social-link" href="https://www.youtube.com/@goodwinsoftwarecompany" target="_blank" rel="noopener noreferrer" aria-label="Goodwin on YouTube">${socialIconSvg.youtube}</a></li>
            </ul>
            <ul class="footer-text-links">
              <li><a href="https://teamgoodwin.com/" target="_blank" rel="noopener noreferrer">TeamGoodwin.com</a></li>
              <li><a href="mailto:run@teamgoodwin.com">Contact</a></li>
            </ul>
          </section>`;

const globalWillGoodgeFooterColumn = willGoodgeFooterColumn.replaceAll("site-footer-link-group", "global-site-footer-link-group");
const globalGoodwinFooterColumn = goodwinFooterColumn.replaceAll("site-footer-link-group", "global-site-footer-link-group");

const socialFooterCss = `.site-footer,.global-site-footer{box-sizing:border-box;background:#0a0a0a!important;color:#fff;padding-inline:clamp(22px,4vw,48px)}
    .site-footer-brand img,.global-site-footer-brand img{filter:brightness(0) invert(1)}
    .site-footer .site-footer-nav > .site-footer-link-group:first-child a,.global-site-footer .global-site-footer-nav > .global-site-footer-link-group:first-child a{color:rgba(255,255,255,.72)}
    .site-footer .site-footer-nav > .site-footer-link-group:first-child a:hover,.site-footer .site-footer-nav > .site-footer-link-group:first-child a:focus-visible,.global-site-footer .global-site-footer-nav > .global-site-footer-link-group:first-child a:hover,.global-site-footer .global-site-footer-nav > .global-site-footer-link-group:first-child a:focus-visible{color:#fff}
    .site-footer .site-footer-nav > .site-footer-link-group:first-child a:focus-visible,.global-site-footer .global-site-footer-nav > .global-site-footer-link-group:first-child a:focus-visible{outline:2px solid #fff;outline-offset:3px}
    .site-footer .footer-column-heading,.global-site-footer .footer-column-heading{margin:0 0 10px;color:#fff;font-family:inherit;font-size:.76rem;font-weight:700;letter-spacing:.18em;line-height:1.3;text-transform:uppercase}
    .site-footer .footer-social-links,.global-site-footer .footer-social-links{display:flex;align-items:center;flex-wrap:nowrap;gap:6px;margin:0 0 8px;padding:0;list-style:none}
    .site-footer .footer-social-links li,.global-site-footer .footer-social-links li{flex:0 0 44px;margin:0;padding:0}
    .site-footer .footer-social-link,.global-site-footer .footer-social-link{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;min-height:44px;box-sizing:border-box;color:#fff!important;text-decoration:none;transition:opacity 160ms ease,transform 160ms ease}
    .site-footer .footer-social-link:link,.site-footer .footer-social-link:visited,.site-footer .footer-social-link:hover,.site-footer .footer-social-link:focus,.site-footer .footer-social-link:focus-visible,.site-footer .footer-social-link:active,.global-site-footer .footer-social-link:link,.global-site-footer .footer-social-link:visited,.global-site-footer .footer-social-link:hover,.global-site-footer .footer-social-link:focus,.global-site-footer .footer-social-link:focus-visible,.global-site-footer .footer-social-link:active{color:#fff!important}
    .site-footer .footer-social-link:hover,.global-site-footer .footer-social-link:hover{opacity:.72;transform:translateY(-1px)}
    .site-footer .footer-social-link:focus-visible,.global-site-footer .footer-social-link:focus-visible{outline:2px solid #fff;outline-offset:2px;opacity:1}
    .site-footer .footer-social-link-disabled,.global-site-footer .footer-social-link-disabled{cursor:default}
    .site-footer .footer-social-icon,.global-site-footer .footer-social-icon{display:block;width:26px;height:26px;color:#fff!important;fill:currentColor!important;stroke:currentColor}
    .site-footer .footer-social-icon path,.global-site-footer .footer-social-icon path{fill:currentColor!important}
    .site-footer .footer-text-links,.global-site-footer .footer-text-links{display:grid;gap:8px;margin:0;padding:0;list-style:none}
    .site-footer .footer-text-links a,.global-site-footer .footer-text-links a{color:rgba(255,255,255,.72);text-decoration:none;transition:color 160ms ease}
    .site-footer .footer-text-links a:hover,.site-footer .footer-text-links a:focus-visible,.global-site-footer .footer-text-links a:hover,.global-site-footer .footer-text-links a:focus-visible{color:#fff}
    .site-footer .footer-text-links a:focus-visible,.global-site-footer .footer-text-links a:focus-visible{outline:2px solid #fff;outline-offset:3px}
    .site-footer .site-footer-link-disabled,.site-footer .site-footer-legal,.site-footer .site-footer-disclaimer,.site-footer .site-footer-bottom,.global-site-footer .global-site-footer-link-disabled,.global-site-footer .global-site-footer-legal,.global-site-footer .global-site-footer-disclaimer,.global-site-footer .global-site-footer-bottom{color:rgba(255,255,255,.64)}
    .site-footer .site-footer-legal a,.global-site-footer .global-site-footer-legal a{color:inherit}
    .site-footer .site-footer-bottom,.global-site-footer .global-site-footer-bottom{border-top-color:rgba(255,255,255,.18)}
    @media(max-width:640px){.site-footer .footer-social-group,.global-site-footer .footer-social-group{padding-top:18px;border-top:1px solid rgba(255,255,255,.16)}.site-footer .site-footer-link-group:nth-child(n + 2)::before,.global-site-footer .global-site-footer-link-group:nth-child(n + 2)::before{display:none!important}.site-footer .footer-social-links,.global-site-footer .footer-social-links{width:max-content;max-width:100%}}
    @media(prefers-reduced-motion:reduce){.site-footer .footer-social-link,.global-site-footer .footer-social-link{transition:none}}`;

const sharedFooterCss = `
    .global-site-footer{width:min(1180px,calc(100% - clamp(44px,10vw,144px)));margin:78px auto 0;border-top:1px solid rgba(20,63,60,.18);color:#143f3c}
    .global-site-footer-main{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(0,2.1fr);gap:clamp(32px,6vw,86px);padding:56px 0}
    .global-site-footer-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:clamp(24px,4vw,64px)}
    .global-site-footer-brand{max-width:260px}
    .global-site-footer-brand img{display:block;width:100%;height:auto}
    .global-site-footer p{max-width:30rem;margin-top:14px;color:rgba(20,63,60,.68);line-height:1.55}
    .global-site-footer ul{display:grid;gap:10px;margin:0;padding:0;list-style:none}
    .global-site-footer a,.global-site-footer-link-disabled{color:rgba(20,63,60,.68);text-decoration:none;white-space:nowrap}
    .global-site-footer a:hover{color:#1c6f4a}
    .global-site-footer-legal{display:flex;flex-wrap:wrap;gap:12px 22px;padding:0 0 28px;color:rgba(20,63,60,.62);font-size:.78rem;line-height:1.5}
    .global-site-footer-disclaimer{max-width:980px;margin:0 0 30px;color:rgba(20,63,60,.58);font-size:.72rem;line-height:1.55}
    .global-site-footer-bottom{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 0;border-top:1px solid rgba(20,63,60,.18);color:rgba(20,63,60,.62);font-size:.8rem}
    @media(max-width:840px){.global-site-footer-main{grid-template-columns:1fr}.global-site-footer-bottom{display:block}}
    @media(max-width:430px){.global-site-footer-nav{grid-template-columns:1fr;gap:18px}.global-site-footer-nav a,.global-site-footer-link-disabled{display:flex;align-items:center;min-height:44px}}
    ${socialFooterCss}`;

const sharedFooterHtml = `
  <footer class="global-site-footer">
    <div class="global-site-footer-main">
      <div>
        <div class="global-site-footer-brand"><img src="assets/goodwin-logo.png" alt="Goodwin"></div>
        <p>Goodwin Company builds next-generation infrastructure for charter aviation and backs athletes redefining human endurance.</p>
      </div>
      <nav class="global-site-footer-nav" aria-label="Footer navigation">
        <ul class="global-site-footer-link-group">
          <li><a href="the-run.html">The Run</a></li>
          <li><a href="fifty-runs.html">50 Runs, 50 States</a></li>
          <li><a href="updates.html">Updates Archive</a></li>
          <li><a href="live-tracking.html#map">Live Map</a></li>
        </ul>
        ${globalWillGoodgeFooterColumn}
        ${globalGoodwinFooterColumn}
      </nav>
    </div>
    <nav class="global-site-footer-legal" aria-label="Legal links">
      <a href="/privacy/">Privacy</a>
      <a href="/terms/">Terms</a>
      <a href="/participation-terms/">Participation Terms</a>
      <a href="/accessibility/">Accessibility</a>
    </nav>
    <p class="global-site-footer-disclaimer">Goodwin Generated Mission America is an endurance event and world record attempt. Routes, schedules, locations, tracking data and event details are subject to change. World record status is subject to independent verification. Participation in any associated run or event is voluntary and subject to the Participation Terms.</p>
    <div class="global-site-footer-bottom">
      <span>© 2026 Goodwin Company</span>
      <span>Goodwin Generated</span>
    </div>
  </footer>`;

function addSharedFooter(html) {
  if (html.includes('class="site-footer"') || html.includes('class="global-site-footer"')) return html;
  let out = html.includes("</style>")
    ? html.replace("</style>", `${sharedFooterCss}\n  </style>`)
    : html.replace("</head>", `<style>${sharedFooterCss}</style></head>`);
  return out.replace("</body>", `${sharedFooterHtml}\n</body>`);
}

function updateExistingFooter(html) {
  const willGroup = /<ul class="site-footer-link-group">(?:(?!<\/ul>)[\s\S])*?https:\/\/www\.instagram\.com\/williamgoodge\/(?:(?!<\/ul>)[\s\S])*?<\/ul>/g;
  const goodwinGroup = /<ul class="site-footer-link-group">(?:(?!<\/ul>)[\s\S])*?https:\/\/www\.linkedin\.com\/company\/teamgoodwin\/(?:(?!<\/ul>)[\s\S])*?<\/ul>/g;

  return html
    .replace(willGroup, willGoodgeFooterColumn)
    .replace(goodwinGroup, goodwinFooterColumn);
}

function addSocialFooterStyles(html) {
  if (!html.includes('class="site-footer"') || html.includes("data-social-footer-styles")) return html;
  return html.replace("</head>", `<style data-social-footer-styles>${socialFooterCss}</style>\n</head>`);
}

function localize(html, pageName) {
  let out = html;
  const offlineFontStylesheet = pageName.startsWith("live-tracking") ? "fonts/inter.css" : "fonts/offline-fonts.css";

  out = out
    .replace(/<script defer src="\/~flock\.js"[^>]*><\/script>/g, "")
    .replace(/<script defer src="\/__l5e\/events\.js"[^>]*><\/script>/g, "")
    .replace(/<script type="module" async="">import\("\/assets\/index-CK5luKon\.js"\)<\/script>/g, "")
    .replace(/<link rel="modulepreload"[^>]*>/g, "")
    .replace(/<link rel="stylesheet" href="\/assets\/styles-ulvf0Dcj\.css"/, `<link rel="stylesheet" href="${offlineFontStylesheet}"/><link rel="stylesheet" href="/assets/styles-ulvf0Dcj.css"`)
    .replace(/https:\/\/mission-america-journey\.lovable\.app\/partners/g, "partners.html")
    .replace(/https:\/\/pub-bb2e103a32db4e198524a2e9ed8f35b4\.r2\.dev\/[^"]+id-preview[^"]+\.png/g, "assets/hero-runner-Ci5y42DW.jpg")
    .replace(/(href|src|poster)="\/assets\//g, '$1="assets/')
    .replace(/(href|src)="\.\.\/fonts\//g, '$1="fonts/')
    .replace(/url\((["']?)\.\.\/assets\//g, "url($1assets/")
    .replace(/content="\/"/g, 'content="index.html"')
    .replace(/content="\/athletes"/g, 'content="athletes.html"')
    .replace(/content="\/partners"/g, 'content="partners.html"')
    .replace(/(href|src|poster)="\.\.\/assets\//g, '$1="assets/')
    .replace(/href="\/#([^"]+)"/g, 'href="index.html#$1"')
    .replace(/href="\/athletes#([^"]+)"/g, 'href="athletes.html#$1"')
    .replace(/href="\/athletes"/g, 'href="athletes.html"')
    .replace(/href="\/partners"/g, 'href="partners.html"')
    .replace(/href="\/"/g, 'href="index.html"');

  for (const id of videoIds) {
    out = out.replace(
      new RegExp(`https://i\\.ytimg\\.com/vi/${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/hqdefault\\.jpg`, "g"),
      `assets/youtube/${id}.jpg`,
    );
  }

  if (pageName === "index.html") {
    out = out.replace(
      '<h1 class="font-display text-[clamp(3rem,9vw,7.5rem)] font-medium leading-[0.92] text-white whitespace-nowrap">',
      '<h1 class="font-display text-[clamp(3rem,9vw,7.5rem)] font-medium leading-[0.92] text-white whitespace-nowrap" style="font-size:clamp(3rem,10vw,8.75rem)">',
    );
    out = out.replace(
      'class="absolute inset-0 w-full h-full object-cover object-[center_25%] sm:object-center"',
      'style="object-position:center center;transform:translateY(44px) scale(1.1);transform-origin:center center" class="absolute inset-0 w-full h-full object-cover object-[center_25%] sm:object-center"',
    );
    out = out.replace(
      "</body>",
      '<script type="module" async="">import("/assets/index-CK5luKon.js")</script></body>',
    );
  }

  if (pageName === "partners.html") {
    out = out.replace(
      '<form class="mt-10 grid gap-4">',
      '<form class="mt-10 grid gap-4" data-offline-partner-form>',
    );
    out = out.replace(
      "</body>",
      `<script>
document.querySelector("[data-offline-partner-form]")?.addEventListener("submit", function (event) {
  event.preventDefault();
  this.outerHTML = '<div class="mt-10 p-8 border border-mint rounded-sm bg-background"><div class="font-display text-2xl text-mint">Received.</div><p class="mt-2 text-foreground/80">Thanks — a member of the Goodwin partnerships team will be in touch shortly.</p></div>';
});
</script></body>`,
    );
  }

  if (
    pageName === "updates.html" ||
    pageName === "faq.html" ||
    pageName === "privacy.html" ||
    pageName === "terms.html" ||
    pageName === "participation-terms.html" ||
    pageName === "accessibility.html"
  ) {
    out = out.replace('<base href="index.html">', '<base href="/">');
    out = out.replace(/(href|src)="assets\/partners\//g, '$1="/assets/partners/');
  }

  return addSocialFooterStyles(addSharedFooter(updateExistingFooter(out)));
}

function patchClientBundle() {
  const homeBundle = join(dist, "assets", "index-BE9Jl0ji.js");
  let js = readFileSync(homeBundle, "utf8");

  js = js.replace(
    'src:M,alt:"William Goodge running at sunset",width:1920,height:1080,className:"absolute inset-0 w-full h-full object-cover object-[center_25%] sm:object-center"',
    'src:M,alt:"William Goodge running at sunset",width:1920,height:1080,style:{objectPosition:"center center",transform:"translateY(44px) scale(1.1)",transformOrigin:"center center"},className:"absolute inset-0 w-full h-full object-cover object-[center_25%] sm:object-center"',
  );

  js = js.replace(
    'className:"font-display text-[clamp(3rem,9vw,7.5rem)] font-medium leading-[0.92] text-white whitespace-nowrap",children:',
    'className:"font-display text-[clamp(3rem,9vw,7.5rem)] font-medium leading-[0.92] text-white whitespace-nowrap",style:{fontSize:"clamp(3rem,10vw,8.75rem)"},children:',
  );

  js = js.replace(
    'src:`https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`',
    'src:`/assets/youtube/${t.id}.jpg`',
  );

  js = js.replace(
    'href:"https://mission-america-journey.lovable.app/partners"',
    'href:"/partners"',
  );

  writeFileSync(homeBundle, js);
}

for (const [source, target] of pages) {
  const html = readFileSync(join(root, source), "utf8");
  const destination = join(dist, target);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, localize(html, target));
}

patchClientBundle();

mkdirSync(join(dist, "athletes"), { recursive: true });
mkdirSync(join(dist, "partners"), { recursive: true });
mkdirSync(join(dist, "live-tracking"), { recursive: true });
mkdirSync(join(dist, "live-tracking-gradient"), { recursive: true });
mkdirSync(join(dist, "the-run"), { recursive: true });
mkdirSync(join(dist, "will"), { recursive: true });
mkdirSync(join(dist, "fifty-runs"), { recursive: true });
mkdirSync(join(dist, "updates"), { recursive: true });
mkdirSync(join(dist, "faq"), { recursive: true });
mkdirSync(join(dist, "week-1"), { recursive: true });
mkdirSync(join(dist, "week-2"), { recursive: true });
mkdirSync(join(dist, "week-3"), { recursive: true });
mkdirSync(join(dist, "privacy"), { recursive: true });
mkdirSync(join(dist, "terms"), { recursive: true });
mkdirSync(join(dist, "participation-terms"), { recursive: true });
mkdirSync(join(dist, "accessibility"), { recursive: true });
cpSync(join(dist, "athletes.html"), join(dist, "athletes", "index.html"));
cpSync(join(dist, "partners.html"), join(dist, "partners", "index.html"));
cpSync(join(dist, "live-tracking.html"), join(dist, "live-tracking", "index.html"));
cpSync(join(dist, "live-tracking-gradient.html"), join(dist, "live-tracking-gradient", "index.html"));
cpSync(join(dist, "the-run.html"), join(dist, "the-run", "index.html"));
cpSync(join(dist, "will.html"), join(dist, "will", "index.html"));
cpSync(join(dist, "fifty-runs.html"), join(dist, "fifty-runs", "index.html"));
cpSync(join(dist, "updates.html"), join(dist, "updates", "index.html"));
cpSync(join(dist, "faq.html"), join(dist, "faq", "index.html"));
cpSync(join(dist, "week-1.html"), join(dist, "week-1", "index.html"));
cpSync(join(dist, "week-2.html"), join(dist, "week-2", "index.html"));
cpSync(join(dist, "week-3.html"), join(dist, "week-3", "index.html"));
cpSync(join(dist, "privacy.html"), join(dist, "privacy", "index.html"));
cpSync(join(dist, "terms.html"), join(dist, "terms", "index.html"));
cpSync(join(dist, "participation-terms.html"), join(dist, "participation-terms", "index.html"));
cpSync(join(dist, "accessibility.html"), join(dist, "accessibility", "index.html"));

writeFileSync(
  join(dist, "README.txt"),
  [
    "Goodwin Generated Mission America offline website export",
    "",
    "Open index.html in a browser to view the site.",
    "For the interactive map and route navigation, serve this folder from a local web server.",
    "Keep the assets folder next to the HTML files.",
    "Keep the fonts folder next to the HTML files.",
    "The visible site assets are bundled locally for offline review.",
    "The display and body fonts are bundled locally for consistent typography.",
    "The sponsor live tracker page is available at live-tracking.html.",
    "The SharpLink-style gradient transition preview is available at live-tracking-gradient.html?intro=1.",
    "The Instagram feed expects a server endpoint at /api/instagram-feed with INSTAGRAM_ACCESS_TOKEN set server-side.",
    "External video and teamGoodwin.com links still point to their original websites when internet is available.",
    "",
  ].join("\n"),
);

mkdirSync(join(dist, "server"), { recursive: true });

const deployInstagramFeed = [
  "assets/instagram/williamgoodge-01.jpg",
  "assets/instagram/williamgoodge-02.jpg",
  "assets/instagram/williamgoodge-03.jpg",
  "assets/instagram/williamgoodge-04.jpg",
  "assets/hero-runner-Ci5y42DW.jpg",
  "assets/road-aerial-DbGvJBXy.jpg",
  "assets/shoes-Ds0VB7pt.jpg",
  "assets/goodge-portrait-BKrZBh3V.jpg",
].map((mediaUrl, index) => ({
  id: `fallback-${index + 1}`,
  permalink: "https://www.instagram.com/williamgoodge?igsi=amphOWpyaXdubzE=",
  mediaUrl: `/${mediaUrl}`,
  caption: "Recent William Goodge Instagram image",
  timestamp: null,
}));

function deployDirectoryAssetPaths(relativeDir) {
  const absoluteDir = join(dist, relativeDir);
  if (!existsSync(absoluteDir)) return [];

  return readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${relativeDir}/${entry.name}`)
    .sort();
}

const deployAssetPaths = [
  "assets/styles-ulvf0Dcj.css",
  "assets/index-CIGW-MKW.css",
  "assets/us-states-albers-10m.js",
  "assets/ticker-updates.json",
  "assets/strava-race-map.mjs",
  "assets/goodwin-favicon.png",
  "assets/goodwin-webclip.png",
  "assets/goodwin-logo.png",
  "assets/mission-america-logo.png",
  "assets/goodge-website.mp4",
  "assets/map-runner-bobblehead-small.png",
  "assets/map-rv-green-small.png",
  "assets/hero-runner-Ci5y42DW.jpg",
  "assets/road-aerial-DbGvJBXy.jpg",
  "assets/shoes-Ds0VB7pt.jpg",
  "assets/goodge-portrait-BKrZBh3V.jpg",
  "assets/field-notes-week-1-launch.jpg",
  "assets/field-notes-week-2-grind.jpg",
  "assets/field-notes-week-3-finish.jpg",
  "assets/intro-dubai-skyline-running.jpg",
  "assets/intro-group-running.jpg",
  "assets/intro-close-portrait.jpg",
  "assets/intro-fence-stretch.jpg",
  "assets/intro-solo-track-running.jpg",
  "fonts/inter.css",
  "fonts/font-8.ttf",
  "fonts/font-9.ttf",
  "fonts/font-10.ttf",
  "fonts/font-11.ttf",
  "assets/instagram/williamgoodge-01.jpg",
  "assets/instagram/williamgoodge-02.jpg",
  "assets/instagram/williamgoodge-03.jpg",
  "assets/instagram/williamgoodge-04.jpg",
  ...deployDirectoryAssetPaths("assets/partners"),
];

function contentType(pathname) {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const deployAssets = Object.fromEntries(
  deployAssetPaths.map((path) => [
    path,
    {
      contentType: contentType(path),
      body: readFileSync(join(dist, path)).toString("base64"),
    },
  ]),
);

const trackingCoreSource = readFileSync(join(root, "api", "flight-tracking-core.mjs"), "utf8")
  .replace(/\bexport\s+/g, "");

writeFileSync(
  join(dist, "server", "index.js"),
  `const pages = ${JSON.stringify(Object.fromEntries([
    ["index.html", readFileSync(join(dist, "live-tracking.html"), "utf8")],
    ["live-tracking.html", readFileSync(join(dist, "live-tracking.html"), "utf8")],
    ["live-tracking/index.html", readFileSync(join(dist, "live-tracking.html"), "utf8")],
    ["live-tracking-gradient.html", readFileSync(join(dist, "live-tracking-gradient.html"), "utf8")],
    ["live-tracking-gradient/index.html", readFileSync(join(dist, "live-tracking-gradient.html"), "utf8")],
    ["the-run.html", readFileSync(join(dist, "the-run.html"), "utf8")],
    ["the-run/index.html", readFileSync(join(dist, "the-run.html"), "utf8")],
    ["will.html", readFileSync(join(dist, "will.html"), "utf8")],
    ["will/index.html", readFileSync(join(dist, "will.html"), "utf8")],
    ["fifty-runs.html", readFileSync(join(dist, "fifty-runs.html"), "utf8")],
    ["fifty-runs/index.html", readFileSync(join(dist, "fifty-runs.html"), "utf8")],
    ["updates.html", readFileSync(join(dist, "updates.html"), "utf8")],
    ["updates/index.html", readFileSync(join(dist, "updates.html"), "utf8")],
    ["faq.html", readFileSync(join(dist, "faq.html"), "utf8")],
    ["faq/index.html", readFileSync(join(dist, "faq.html"), "utf8")],
    ["week-1.html", readFileSync(join(dist, "week-1.html"), "utf8")],
    ["week-1/index.html", readFileSync(join(dist, "week-1.html"), "utf8")],
    ["week-2.html", readFileSync(join(dist, "week-2.html"), "utf8")],
    ["week-2/index.html", readFileSync(join(dist, "week-2.html"), "utf8")],
    ["week-3.html", readFileSync(join(dist, "week-3.html"), "utf8")],
    ["week-3/index.html", readFileSync(join(dist, "week-3.html"), "utf8")],
    ["privacy.html", readFileSync(join(dist, "privacy.html"), "utf8")],
    ["privacy/index.html", readFileSync(join(dist, "privacy.html"), "utf8")],
    ["terms.html", readFileSync(join(dist, "terms.html"), "utf8")],
    ["terms/index.html", readFileSync(join(dist, "terms.html"), "utf8")],
    ["participation-terms.html", readFileSync(join(dist, "participation-terms.html"), "utf8")],
    ["participation-terms/index.html", readFileSync(join(dist, "participation-terms.html"), "utf8")],
    ["accessibility.html", readFileSync(join(dist, "accessibility.html"), "utf8")],
    ["accessibility/index.html", readFileSync(join(dist, "accessibility.html"), "utf8")],
  ]))};
const assets = ${JSON.stringify(deployAssets)};
const instagramFeed = ${JSON.stringify(deployInstagramFeed)};
${trackingCoreSource}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const clean = pathname.replace(/^\\/+/, "").replace(/\\/+$/, "");

    const page = pathname === "/" ? pages["index.html"] : pages[clean] || pages[clean + "/index.html"];
    if (page) {
      return new Response(page, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache"
        }
      });
    }

    if (clean === "api/instagram-feed") {
      return Response.json({ data: instagramFeed }, { headers: { "cache-control": "no-cache" } });
    }

    if (clean === "api/tracking-status") {
      if (request.method !== "GET") {
        return Response.json({ error: "method_not_allowed" }, {
          status: 405,
          headers: { "cache-control": "no-store", "allow": "GET" }
        });
      }
      const { searchParams } = new URL(request.url);
      const pinnedProgress = Number(searchParams.get("progress"));
      return Response.json({
        source: "mock",
        mode: "simulated",
        updatedAt: new Date().toISOString(),
        progress: Number.isFinite(pinnedProgress) ? Math.min(1, Math.max(0, pinnedProgress)) : 0,
        flightStatus: publicFlightStatus({
          now: searchParams.get("now") || new Date(),
          env
        })
      }, { headers: { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" } });
    }

    if (clean.startsWith("api/")) {
      return new Response("Not found", { status: 404 });
    }

    const asset = assets[clean];
    if (asset) {
      const bytes = Uint8Array.from(atob(asset.body), (char) => char.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          "content-type": asset.contentType,
          "cache-control": clean.endsWith(".css") || clean.endsWith(".json") ? "no-cache" : "public, max-age=31536000, immutable"
        }
      });
    }

    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    }

    return new Response("Not found", { status: 404 });
  }
};
`,
);
