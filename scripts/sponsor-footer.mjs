const primarySponsors = [
  ["Arsenal Aviation", "https://www.arsenalaviation.com/", "arsenal-aviation-footer.svg", 849, 624],
  ["Trilogy Aviation Group", "https://www.trilogyaviationgroup.com/", "trilogy-aviation-footer.svg", 367, 76],
  ["Titan Aviation Group", "https://titanflights.com/", "titan-aviation-footer.png", 375, 111],
  ["FLY1200", "https://fly1200.com/", "fly1200-footer.svg", 2769, 1112],
  ["Jet Excellence", "https://www.jetexcellence.com/", "jet-excellence-footer.png", 600, 176],
  ["Jet Linx", "https://jetlinx.com/", "jet-linx-footer.svg", 250, 158],
  ["Skyward Aviation", "https://skywardaviation.com/", "skyward-aviation-footer.svg", 1443, 1012],
  ["TrueSkies Aviation Group", "https://flytrueskies.com/", "trueskies-footer.svg", 1697, 543],
  ["Magellan Jets", "https://magellanjets.com/", "magellan-jets-footer.svg", 265, 25],
  ["Charter Flight Support", "https://www.charterflightsupport.com/", "charter-flight-support-footer.svg", 250, 100],
  ["Spyroll Studios", "https://www.spyrollstudios.com/", "spyroll-studios-logo.avif", 692, 104],
  ["David", "https://davidprotein.com/", "david-footer.png", 905, 386],
  ["Humantra", "https://humantra.co.uk/", "humantra-footer.png", 1501, 273],
  ["Rizkia", "https://rizkia.com/", "rizkia-footer.png", 1493, 369],
  ["WHOOP", "https://www.whoop.com/", "whoop-footer.png", 1501, 255],
];

const additionalSponsors = [
  ["Hertz", "https://www.hertz.com/", "hertz-footer.png", 268, 96],
  ["Bingo Jets", "https://www.bingojets.com/", "bingo-jets-footer.png", 420, 337, "partner-logo-item-bingo"],
  ["Moxy Hotels", "https://www.marriott.com/brands/moxy-hotels.mi", "moxy-hotels-footer.svg", 254, 88],
  ["Fontainebleau Miami Beach", "https://www.fontainebleau.com/miamibeach/", "fontainebleau-miami-beach-footer.svg", 143, 47],
  ["Fontainebleau Las Vegas", "https://www.fontainebleaulasvegas.com/", "fontainebleau-las-vegas-footer.svg", 143, 47],
  ["Real SLX", "https://realslx.com/?utm_source=ig&amp;utm_medium=social&amp;utm_content=link_in_bio", "real-slx-footer.svg", 1506, 751],
  ["Skyway Aviation", "https://flyskyway.com/", "skyway-aviation-footer.png", 600, 152],
];

function sponsorItem([name, href, asset, width, height, extraClass = ""]) {
  const itemClass = `partner-logo-item${extraClass ? ` ${extraClass}` : ""}`;
  const alt = name === "Real SLX" ? "Real SLX text logo" : `${name} logo`;
  return `<div class="${itemClass}"><a href="${href}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${name}"><img src="/assets/partners/${asset}" alt="${alt}" width="${width}" height="${height}" loading="lazy" decoding="async"></a></div>`;
}

export function sponsorFooterHtml(className = "site-footer-partners") {
  return `<div class="${className}" aria-label="Partners">
          <div class="tracker-eyebrow">MADE POSSIBLE BY</div>
          <div class="partner-logo-wall">${primarySponsors.map(sponsorItem).join("")}</div>
          <div class="partner-logo-row-new" aria-label="Additional partners">${additionalSponsors.map(sponsorItem).join("")}</div>
          <p class="site-footer-partner-disclaimer">All trademarks and logos are the property of their respective owners and are used with permission where applicable.</p>
        </div>`;
}

export const approvedSponsorFooterHtml = sponsorFooterHtml();
export const approvedGlobalSponsorFooterHtml = sponsorFooterHtml("global-site-footer-partners");

export const approvedSponsorFooterCss = `.site-footer .partner-logo-item img[src$="jet-excellence-footer.png"],.global-site-footer .partner-logo-item img[src$="jet-excellence-footer.png"]{filter:grayscale(1) brightness(0) invert(1)}
    .site-footer .partner-logo-row-new,.global-site-footer .partner-logo-row-new{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;justify-items:center;column-gap:clamp(18px,2.6vw,38px);row-gap:28px;margin-top:34px;padding-top:0;border-top:0}
    .site-footer .partner-logo-row-new .partner-logo-item,.global-site-footer .partner-logo-row-new .partner-logo-item{display:flex;grid-column:auto;order:initial;align-items:center;justify-content:center;width:100%;min-width:0;min-height:54px}
    .site-footer .partner-logo-row-new .partner-logo-item a,.global-site-footer .partner-logo-row-new .partner-logo-item a{display:flex;align-items:center;justify-content:center;width:100%;min-width:0;min-height:48px;border-radius:2px}
    .site-footer .partner-logo-row-new .partner-logo-item a:focus-visible,.global-site-footer .partner-logo-row-new .partner-logo-item a:focus-visible{outline:2px solid #fff;outline-offset:5px}
    .site-footer .partner-logo-row-new .partner-logo-item img,.global-site-footer .partner-logo-row-new .partner-logo-item img{display:block;width:auto;max-width:min(150px,100%);max-height:44px;object-fit:contain;filter:brightness(0) invert(1);opacity:.76;transition:opacity 160ms ease,transform 160ms ease}
    .site-footer .partner-logo-row-new .partner-logo-item-bingo img,.global-site-footer .partner-logo-row-new .partner-logo-item-bingo img{max-height:52px}
    .site-footer .partner-logo-row-new .partner-logo-item:nth-child(6):nth-last-child(2),.global-site-footer .partner-logo-row-new .partner-logo-item:nth-child(6):nth-last-child(2){grid-column:2;transform:translateX(50%)}
    .site-footer .partner-logo-row-new .partner-logo-item:nth-child(7):last-child,.global-site-footer .partner-logo-row-new .partner-logo-item:nth-child(7):last-child{grid-column:4;transform:translateX(-50%)}
    .site-footer .partner-logo-row-new .partner-logo-item a:hover img,.site-footer .partner-logo-row-new .partner-logo-item a:focus-visible img,.global-site-footer .partner-logo-row-new .partner-logo-item a:hover img,.global-site-footer .partner-logo-row-new .partner-logo-item a:focus-visible img{opacity:1;transform:translateY(-1px)}
    @media(max-width:940px){.site-footer .partner-logo-row-new,.global-site-footer .partner-logo-row-new{grid-template-columns:repeat(3,minmax(0,1fr))}.site-footer .partner-logo-row-new .partner-logo-item:nth-child(6):nth-last-child(2),.global-site-footer .partner-logo-row-new .partner-logo-item:nth-child(6):nth-last-child(2){grid-column:auto;transform:none}.site-footer .partner-logo-row-new .partner-logo-item:nth-child(7):last-child,.global-site-footer .partner-logo-row-new .partner-logo-item:nth-child(7):last-child{grid-column:2;transform:none}}
    @media(max-width:640px){.site-footer .site-footer-partners,.global-site-footer .global-site-footer-partners{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;justify-items:stretch;column-gap:12px;row-gap:24px}.site-footer .site-footer-partners>.tracker-eyebrow,.site-footer .site-footer-partners>.site-footer-partner-disclaimer,.global-site-footer .global-site-footer-partners>.tracker-eyebrow,.global-site-footer .global-site-footer-partners>.site-footer-partner-disclaimer{grid-column:1 / -1}.site-footer .site-footer-partners>.partner-logo-wall,.site-footer .site-footer-partners>.partner-logo-row-new,.global-site-footer .global-site-footer-partners>.partner-logo-wall,.global-site-footer .global-site-footer-partners>.partner-logo-row-new{display:contents}.site-footer .site-footer-partners>.partner-logo-wall>.partner-logo-item:nth-child(n),.site-footer .site-footer-partners>.partner-logo-row-new>.partner-logo-item:nth-child(n),.global-site-footer .global-site-footer-partners>.partner-logo-wall>.partner-logo-item:nth-child(n),.global-site-footer .global-site-footer-partners>.partner-logo-row-new>.partner-logo-item:nth-child(n){grid-column:auto;grid-row:auto;order:initial;transform:none;width:100%;min-height:48px}.site-footer .site-footer-partners .partner-logo-item img,.global-site-footer .global-site-footer-partners .partner-logo-item img{max-width:min(138px,100%);max-height:38px}.site-footer .site-footer-partners .partner-logo-item-bingo img,.global-site-footer .global-site-footer-partners .partner-logo-item-bingo img{max-height:46px}.site-footer .site-footer-partners>.site-footer-partner-disclaimer,.global-site-footer .global-site-footer-partners>.site-footer-partner-disclaimer{margin-top:4px}}
    @media(prefers-reduced-motion:reduce){.site-footer .partner-logo-row-new .partner-logo-item img,.global-site-footer .partner-logo-row-new .partner-logo-item img{transition:none}}`;

function findClosingDiv(html, start) {
  const tags = /<div\b[^>]*>|<\/div>/gi;
  tags.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tags.exec(html))) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return tags.lastIndex;
  }
  throw new Error("sponsor_footer_close_missing");
}

export function applyApprovedSponsorFooter(html) {
  const marker = /<div class="(site-footer-partners|global-site-footer-partners)" aria-label="Partners">/;
  const match = marker.exec(html);
  if (!match) throw new Error("sponsor_footer_missing");
  const start = match.index;
  const end = findClosingDiv(html, start);
  let output = `${html.slice(0, start)}${sponsorFooterHtml(match[1])}${html.slice(end)}`;
  if (!output.includes("data-sponsor-footer-styles")) {
    output = output.replace("</head>", `<style data-sponsor-footer-styles>${approvedSponsorFooterCss}</style>\n</head>`);
  }
  return output.replace(/[ \t]+$/gm, "");
}
