const archiveRoot = "/portfolio/mission-america-2026/";
const archiveMap = `${archiveRoot}live-tracking.html`;

const oldDisclaimer = "Goodwin Generated Mission America is an endurance event and world record attempt. Routes, schedules, locations, tracking data and event details are subject to change. World record status is subject to independent verification. Participation in any associated run or event is voluntary and subject to the Participation Terms.";
const retrospectiveDisclaimer = "Mission America concluded on November 1, 2026. William Goodge’s Guinness World Records title was announced on November 6, 2026. Historical route, schedule, tracking, and participation information is retained for context; registration is closed.";

const pageNotices = {
  "updates.html": "Archived field notes from Mission America. This page uses a captured public snapshot and does not poll a live feed.",
  "participation-terms.html": "Historical participation terms. Mission America is complete and registration is closed; this waiver is retained for reference only.",
  "week-1.html": "Historical field notes. This page preserves the original Week 1 planning account; Mission America is complete and the world record is confirmed.",
  "week-2.html": "Historical field notes. This page preserves the original Week 2 planning account; Mission America is complete and the world record is confirmed.",
  "week-3.html": "Historical field notes. This page preserves the original Week 3 planning account; Mission America is complete and the world record is confirmed.",
};

function replaceCommonNavigation(html) {
  return html
    .replaceAll('href="/live-tracking/#the-run"', 'href="/the-run/"')
    .replaceAll('href="/#the-run"', 'href="/the-run/"')
    .replaceAll('href="/live-tracking/#map"', `href="${archiveMap}"`)
    .replaceAll('href="/#map"', `href="${archiveMap}"`)
    .replaceAll('href="index.html#map"', `href="${archiveMap}"`)
    .replaceAll('href="/live-tracking/#why"', 'href="/will/"')
    .replaceAll('href="/live-tracking/#rsvp"', `href="${archiveRoot}"`)
    .replaceAll('href="/#rsvp"', `href="${archiveRoot}"`)
    .replaceAll('href="index.html#rsvp"', `href="${archiveRoot}"`)
    .replaceAll('>Join the Run<', '>Mission Archive<')
    .replaceAll('>Live Map<', '>Map Archive<')
    .replaceAll('>Run With Will →<', '>Explore the completed route →<');
}

function replaceLegacyStatusLanguage(html) {
  return html
    .replaceAll(oldDisclaimer, retrospectiveDisclaimer)
    .replace('<section class="legal-section"><h2>Live Tracking</h2><p>Location and status information may be delayed, approximate, or temporarily unavailable. Live tracking is provided for informational purposes and is not guaranteed to be real time.</p></section>', '<section class="legal-section"><h2>Historical Tracking</h2><p>The archived map presents captured historical route and status information for reference. It is not a live location service.</p></section>')
    .replace('<section class="legal-section"><h2>World Record Attempt</h2><p>Goodwin Generated Mission America is a world-record attempt. Any record status remains subject to completion of the attempt and applicable independent review or verification.</p></section>', '<section class="legal-section"><h2>World Record</h2><p>Mission America is complete. Guinness World Records announced William Goodge’s confirmed title on November 6, 2026.</p></section>')
    .replace('<section class="legal-section"><h2>Run With Will</h2><p>Participation in any Run With Will segment is governed separately by the <a href="/participation-terms/">Participation Terms</a>.</p></section>', '<section class="legal-section"><h2>Historical Participation</h2><p>Registration is closed. The original <a href="/participation-terms/">Participation Terms</a> remain available for reference.</p></section>')
    .replaceAll("THE RECORD ATTEMPT", "THE WORLD RECORD")
    .replaceAll("World Record Attempt", "World Record")
    .replaceAll("The Record Attempt", "The World Record")
    .replaceAll("world record attempt", "completed world-record mission")
    .replaceAll("World record attempt", "Completed world-record mission")
    .replaceAll("record attempt", "record-setting mission");
}

function updateRunPage(html) {
  return html
    .replace(
      /Follow Will’s live progress on the <a href="[^"]+">homepage map<\/a>\./,
      'Explore the completed mission through the <a href="/portfolio/mission-america-2026/live-tracking.html">historical route map</a>.'
    )
    .replace("50 states. 50 marathons. 24 days.", "50 states. 50 marathons. One world record.")
    .replace("Beginning in Hawaii on October 9 and finishing in New York on November 1, Will Goodge will attempt to run a marathon in every U.S. state in just 24 days.", "From Hawaii on October 9 to New York on November 1, William Goodge completed a marathon-distance run in every U.S. state in 22 days, 17 hours, 16 minutes and 34 seconds.")
    .replace("Every state, one continuous attempt.", "Every state, one continuous mission.")
    .replace("Running 1,310 miles is only possible if everything between the miles works.", "Running 1,310 miles was possible only because everything between the miles worked.")
    .replace("Every finish line starts another countdown. Will has to recover, refuel and get to another state before doing it all again.", "Every finish line started another transfer window. William had to recover, refuel, and reach the next state before doing it all again.")
    .replace("That’s what makes this attempt so complicated: the clock keeps moving even when Will isn’t running.", "That is what made the mission so complicated: the clock kept moving even when William was not running.")
    .replace('Follow Will’s live progress on the <a href="/#map">homepage map</a>.', `Explore the completed route on the <a href="${archiveMap}">historical map</a>.`)
    .replace('<div class="stat"><strong>24</strong><span>Days</span></div>', '<div class="stat"><strong>22</strong><span>Days, 17:16:34</span></div>');
}

function updateFiftyRunsPage(html) {
  return html
    .replace('aria-label="Record attempt summary"', 'aria-label="World record route summary"')
    .replace("Every run has to meet the requirements of the record attempt.", "Every run met the requirements of the record-setting mission.")
    .replace('<div><div class="eyebrow">THE WINDOW</div><strong>24 days.</strong><p>From the first start in Hawaii to the final finish in New York.</p></div>', '<div><div class="eyebrow">THE TIME</div><strong class="record-time">22 days,<br>17:16:34</strong><p>From the first start in Hawaii to the final finish in New York.</p></div>')
    .replace("Route data, timestamps, tracking, media and crew documentation will create the evidence trail for the attempt.", "Route data, timestamps, tracking, media, and crew documentation created the evidence trail for the confirmed record.");
}

function updateWillPage(html) {
  return html
    .replace("This time, running isn’t enough.", "Running was only one part of the mission.")
    .replace("Normally, you finish a marathon and recovery begins. During Mission America, Will finishes one and immediately starts preparing for the next.", "During Mission America, William finished each marathon-distance run and immediately began preparing for the next.")
    .replace("He has to eat, recover, travel, sleep when he can, wake up somewhere else and run another 26.2 miles. The team and systems around him are a major part of whether that works.", "He had to eat, recover, travel, sleep when he could, wake up somewhere else, and run another 26.2 miles. The team and systems around him were essential to making that work.")
    .replace("FOLLOW WILL", "FROM WILL")
    .replace("Recent from Will", "Mission America photography")
    .replace("From training to race day, follow the attempt through Will’s eyes.", "A preserved selection of photography from William’s Mission America journey.")
    .replace(/    async function loadWillInstagram\(\) \{[\s\S]*?\n    \}\n\n    loadWillInstagram\(\);/, "    renderWillInstagram(fallbackInstagram);");
}

function updateFaqPage(html) {
  return html
    .replace("Yes — and we hope people will.", "Mission America is complete, and participation registration is closed.")
    .replace("At every stop, runners will have the opportunity to join Will for the first 5K. With 50 states on the schedule, there’s a good chance he’ll be running somewhere near you.", "During the mission, runners joined William for selected opening segments across the 50-state route.")
    .replace("You can come on your own, bring a friend or sign up with your run club. It’s a chance to experience a small piece of the attempt from inside it rather than just following along.", "Those community runs are now part of the historical account. The completed route and archived map remain available to explore.")
    .replace('href="/portfolio/mission-america-2026/">Explore the completed route →</a>', `href="${archiveMap}">Explore the completed route →</a>`)
    .replace("Running 50 marathons isn’t enough. Every one has to count.", "Running 50 marathon-distance courses was only one part of the record. Every one had to count.")
    .replace("The attempt will be documented through route data, timestamps, tracking, media and crew records, with the evidence submitted for official verification after the challenge is complete.", "The mission was documented through route data, timestamps, tracking, media, and crew records. Guinness World Records confirmed William Goodge’s title on November 6, 2026.")
    .replace("You can support the mission and follow the fundraising effort here.", "The mission’s charitable purpose continues to honor Amanda and everyone affected by cancer. The original fundraising page is retained as a historical campaign link.")
    .replace("Support the Mission →", "Original fundraising page →");
}

function updateUpdatesPage(html) {
  return html
    .replace("RUNNING LIVE", "FIELD NOTES ARCHIVE")
    .replace("From the road.", "From the road")
    .replace("50 states. 24 days. This is where we’ll share what’s happening along the way — runs, transfers, milestones and everything in between.", "Captured public notes from the completed journey: runs, transfers, milestones, and the operational rhythm between them.")
    .replace(/    const sheetConfig = \{[\s\S]*?\n    window\.setInterval\(\(\) => loadArchive\(\{ bypassCache: true \}\), sheetConfig\.cacheMs\);/, `    const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

    async function loadArchive() {
      const container = document.querySelector("[data-updates-archive]");
      try {
        const response = await fetch("/assets/ticker-updates.json", { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Archived field notes unavailable");
        const payload = await response.json();
        const updates = Array.isArray(payload.updates) ? payload.updates : [];
        container.innerHTML = updates.map((update) => \
          \`<article class="update"><time>\${esc([update.date, update.time].filter(Boolean).join(" | "))}</time><div><h2>\${esc(update.title)}</h2><p>\${esc(update.body)}</p></div></article>\`
        ).join("") || '<article class="update"><time>Archive</time><div><h2>No captured field notes are available.</h2></div></article>';
      } catch (error) {
        container.innerHTML = '<article class="update"><time>Archive</time><div><h2>Field notes unavailable.</h2><p>The captured archive could not be loaded.</p></div></article>';
      }
    }

    loadArchive();`);
}

function addRetrospectiveNotice(html, target) {
  if (html.includes("data-retrospective-context")) return html;
  const notice = pageNotices[target] || "Mission America concluded on November 1, 2026. This page is retained as part of the completed mission’s historical account; the Guinness World Records title is confirmed.";
  let output = /<base\b/i.test(html)
    ? html.replace(/<base\b[^>]*>/i, '<base href="/">')
    : html.replace("</head>", '<base href="/">\n</head>');
  output = output.includes("retrospective-context.css")
    ? output
    : output.replace("</head>", '<link rel="stylesheet" href="/assets/retrospective-context.css?v=20261109-retrospective-2">\n</head>');
  return output.replace("</nav>", `</nav>\n      <aside class="retrospective-context" data-retrospective-context role="note"><strong>Mission complete</strong><span>${notice}</span></aside>`);
}

export function applyRetrospectiveLegacyPage(html, target) {
  let output = html.replaceAll("\u0000", "");
  output = replaceCommonNavigation(output);
  output = replaceLegacyStatusLanguage(output);

  if (target === "the-run.html") output = updateRunPage(output);
  if (target === "fifty-runs.html") output = updateFiftyRunsPage(output);
  if (target === "will.html") output = updateWillPage(output);
  if (target === "faq.html") output = updateFaqPage(output);
  if (target === "updates.html") output = updateUpdatesPage(output);

  return addRetrospectiveNotice(output, target);
}

export function createHistoricalMapRedirectPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, follow">
  <meta http-equiv="refresh" content="0; url=${archiveMap}">
  <link rel="canonical" href="${archiveMap}">
  <title>Mission America Historical Map</title>
  <style>body{margin:0;display:grid;min-height:100vh;place-items:center;background:#06120e;color:#fff;font-family:Arial,sans-serif}main{max-width:42rem;padding:2rem;text-align:center}a{color:#bca273}</style>
</head>
<body>
  <main>
    <h1>Mission America historical map</h1>
    <p>Live tracking has ended. The recorded route and status snapshot are preserved in the independent portfolio archive.</p>
    <p><a href="${archiveMap}">Open the historical map</a></p>
  </main>
</body>
</html>`;
}
