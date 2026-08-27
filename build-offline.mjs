import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, "assets"), join(dist, "assets"), { recursive: true });
cpSync(join(root, "fonts"), join(dist, "fonts"), { recursive: true });
if (existsSync(join(root, "api"))) {
  cpSync(join(root, "api"), join(dist, "api"), { recursive: true });
}

const pages = [
  ["source-html/index.raw.html", "index.html"],
  ["source-html/athletes.raw.html", "athletes.html"],
  ["source-html/partners.raw.html", "partners.html"],
  ["source-html/live-tracking.html", "live-tracking.html"],
  ["source-html/the-run.raw.html", "the-run.html"],
  ["source-html/will.raw.html", "will.html"],
  ["source-html/fifty-runs.raw.html", "fifty-runs.html"],
  ["source-html/updates.raw.html", "updates.html"],
  ["source-html/faq.raw.html", "faq.html"],
  ["source-html/week-1.raw.html", "week-1.html"],
  ["source-html/week-2.raw.html", "week-2.html"],
  ["source-html/week-3.raw.html", "week-3.html"],
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

const sharedFooterCss = `
    .global-site-footer{width:min(1180px,calc(100% - clamp(44px,10vw,144px)));margin:78px auto 0;border-top:1px solid rgba(20,63,60,.18);color:#143f3c}
    .global-site-footer-main{display:grid;grid-template-columns:minmax(0,2fr) repeat(2,minmax(180px,1fr));gap:clamp(32px,6vw,86px);padding:56px 0}
    .global-site-footer-brand{max-width:260px}
    .global-site-footer-brand img{display:block;width:100%;height:auto}
    .global-site-footer p{max-width:30rem;margin-top:14px;color:rgba(20,63,60,.68);line-height:1.55}
    .global-site-footer ul{display:grid;gap:10px;margin:16px 0 0;padding:0;list-style:none}
    .global-site-footer a{color:rgba(20,63,60,.68);text-decoration:none}
    .global-site-footer a:hover{color:#1c6f4a}
    .global-site-footer-bottom{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 0;border-top:1px solid rgba(20,63,60,.18);color:rgba(20,63,60,.62);font-size:.8rem}
    @media(max-width:840px){.global-site-footer-main{grid-template-columns:1fr}.global-site-footer-bottom{display:block}}`;

const sharedFooterHtml = `
  <footer class="global-site-footer">
    <div class="global-site-footer-main">
      <div>
        <div class="global-site-footer-brand"><img src="assets/goodwin-logo.png" alt="Goodwin"></div>
        <p>Goodwin Company builds next-generation infrastructure for charter aviation and backs athletes redefining human endurance.</p>
      </div>
      <div>
        <div class="eyebrow">Mission America</div>
        <ul>
          <li><a href="the-run.html">The Run</a></li>
          <li><a href="fifty-runs.html">50 Runs, 50 States</a></li>
          <li><a href="updates.html">Updates Archive</a></li>
          <li><a href="faq.html">FAQ</a></li>
          <li><a href="live-tracking.html#map">Live Map</a></li>
        </ul>
      </div>
      <div>
        <div class="eyebrow">Team Goodwin</div>
        <ul>
          <li><a href="will.html">Will</a></li>
          <li><a href="athletes.html">Roster</a></li>
          <li><a href="partners.html">Partners</a></li>
          <li><a href="https://www.teamgoodwin.com" target="_blank" rel="noreferrer">teamGoodwin.com</a></li>
        </ul>
      </div>
    </div>
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

function localize(html, pageName) {
  let out = html;

  out = out
    .replace(/<script defer src="\/~flock\.js"[^>]*><\/script>/g, "")
    .replace(/<script defer src="\/__l5e\/events\.js"[^>]*><\/script>/g, "")
    .replace(/<script type="module" async="">import\("\/assets\/index-CK5luKon\.js"\)<\/script>/g, "")
    .replace(/<link rel="modulepreload"[^>]*>/g, "")
    .replace(/<link rel="stylesheet" href="\/assets\/styles-ulvf0Dcj\.css"/, '<link rel="stylesheet" href="fonts/offline-fonts.css"/><link rel="stylesheet" href="/assets/styles-ulvf0Dcj.css"')
    .replace(/https:\/\/mission-america-journey\.lovable\.app\/partners/g, "partners.html")
    .replace(/https:\/\/pub-bb2e103a32db4e198524a2e9ed8f35b4\.r2\.dev\/[^"]+id-preview[^"]+\.png/g, "assets/hero-runner-Ci5y42DW.jpg")
    .replace(/(href|src)="\/assets\//g, '$1="assets/')
    .replace(/content="\/"/g, 'content="index.html"')
    .replace(/content="\/athletes"/g, 'content="athletes.html"')
    .replace(/content="\/partners"/g, 'content="partners.html"')
    .replace(/(href|src)="\.\.\/assets\//g, '$1="assets/')
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

  return addSharedFooter(out);
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
mkdirSync(join(dist, "the-run"), { recursive: true });
mkdirSync(join(dist, "will"), { recursive: true });
mkdirSync(join(dist, "fifty-runs"), { recursive: true });
mkdirSync(join(dist, "updates"), { recursive: true });
mkdirSync(join(dist, "faq"), { recursive: true });
mkdirSync(join(dist, "week-1"), { recursive: true });
mkdirSync(join(dist, "week-2"), { recursive: true });
mkdirSync(join(dist, "week-3"), { recursive: true });
cpSync(join(dist, "athletes.html"), join(dist, "athletes", "index.html"));
cpSync(join(dist, "partners.html"), join(dist, "partners", "index.html"));
cpSync(join(dist, "live-tracking.html"), join(dist, "live-tracking", "index.html"));
cpSync(join(dist, "the-run.html"), join(dist, "the-run", "index.html"));
cpSync(join(dist, "will.html"), join(dist, "will", "index.html"));
cpSync(join(dist, "fifty-runs.html"), join(dist, "fifty-runs", "index.html"));
cpSync(join(dist, "updates.html"), join(dist, "updates", "index.html"));
cpSync(join(dist, "faq.html"), join(dist, "faq", "index.html"));
cpSync(join(dist, "week-1.html"), join(dist, "week-1", "index.html"));
cpSync(join(dist, "week-2.html"), join(dist, "week-2", "index.html"));
cpSync(join(dist, "week-3.html"), join(dist, "week-3", "index.html"));

writeFileSync(
  join(dist, "README.txt"),
  [
    "Goodwin Mission America offline website export",
    "",
    "Open index.html in a browser to view the site.",
    "For the interactive map and route navigation, serve this folder from a local web server.",
    "Keep the assets folder next to the HTML files.",
    "Keep the fonts folder next to the HTML files.",
    "The visible site assets are bundled locally for offline review.",
    "The display and body fonts are bundled locally for consistent typography.",
    "The sponsor live tracker page is available at live-tracking.html.",
    "The Instagram feed expects a server endpoint at /api/instagram-feed with INSTAGRAM_ACCESS_TOKEN set server-side.",
    "External video and teamGoodwin.com links still point to their original websites when internet is available.",
    "",
  ].join("\n"),
);

mkdirSync(join(dist, "server"), { recursive: true });

const deployAssetPaths = [
  "assets/styles-ulvf0Dcj.css",
  "assets/index-CIGW-MKW.css",
  "assets/us-states-albers-10m.json",
  "assets/ticker-updates.json",
  "assets/goodwin-favicon.png",
  "assets/goodwin-webclip.png",
  "assets/goodwin-logo.png",
  "assets/mission-america-logo.png",
  "assets/goodge-website.mp4",
  "assets/map-runner-bobblehead.png",
  "assets/map-rv-green.png",
  "assets/instagram/williamgoodge-01.jpg",
  "assets/instagram/williamgoodge-02.jpg",
  "assets/instagram/williamgoodge-03.jpg",
  "assets/instagram/williamgoodge-04.jpg",
  "assets/hero-runner-Ci5y42DW.jpg",
  "assets/road-aerial-DbGvJBXy.jpg",
  "assets/shoes-Ds0VB7pt.jpg",
  "assets/goodge-portrait-BKrZBh3V.jpg",
  "fonts/offline-fonts.css",
  "fonts/font-1.ttf",
  "fonts/font-2.ttf",
  "fonts/font-3.ttf",
  "fonts/font-4.ttf",
  "fonts/font-5.ttf",
  "fonts/font-6.ttf",
  "fonts/font-7.ttf",
  "fonts/font-8.ttf",
  "fonts/font-9.ttf",
  "fonts/font-10.ttf",
  "fonts/font-11.ttf",
];

function contentType(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  if (pathname.endsWith(".ttf")) return "font/ttf";
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

writeFileSync(
  join(dist, "server", "index.js"),
  `const pages = ${JSON.stringify(Object.fromEntries([
    ["index.html", readFileSync(join(dist, "live-tracking.html"), "utf8")],
    ["live-tracking.html", readFileSync(join(dist, "live-tracking.html"), "utf8")],
    ["live-tracking/index.html", readFileSync(join(dist, "live-tracking.html"), "utf8")],
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
  ]))};
const assets = ${JSON.stringify(deployAssets)};
const instagramFeed = ${JSON.stringify(deployInstagramFeed)};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const clean = pathname.replace(/^\\/+/, "");

    const page = pathname === "/" ? pages["index.html"] : pages[clean];
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

    return new Response("Not found", { status: 404 });
  }
};
`,
);
