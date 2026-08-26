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

  return out;
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
cpSync(join(dist, "athletes.html"), join(dist, "athletes", "index.html"));
cpSync(join(dist, "partners.html"), join(dist, "partners", "index.html"));
cpSync(join(dist, "live-tracking.html"), join(dist, "live-tracking", "index.html"));

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
writeFileSync(
  join(dist, "server", "index.js"),
  `const manifest = __STATIC_CONTENT_MANIFEST;
const assets = typeof manifest === "string" ? JSON.parse(manifest) : manifest;

function contentType(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  if (pathname.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}

function candidates(url) {
  const { pathname } = new URL(url);
  const clean = pathname.replace(/^\\/+/, "") || "index.html";
  const list = [clean];
  if (!clean.includes(".")) list.push(clean.replace(/\\/$/, "") + "/index.html");
  if (!clean.endsWith(".html")) list.push(clean.replace(/\\/$/, "") + ".html");
  return list;
}

export default {
  async fetch(request, env) {
    for (const path of candidates(request.url)) {
      const key = assets[path];
      if (!key) continue;
      const asset = await env.__STATIC_CONTENT.get(key, "arrayBuffer");
      if (!asset) continue;
      return new Response(asset, {
        headers: {
          "content-type": contentType(path),
          "cache-control": path.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable"
        }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
`,
);
