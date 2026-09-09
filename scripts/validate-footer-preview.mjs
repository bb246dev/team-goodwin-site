import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.argv[2] || "http://127.0.0.1:8765";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pages = ["/", "/the-run/", "/will/", "/fifty-runs/", "/live-tracking/", "/week-1/", "/week-2/", "/week-3/"];
const requestedViewport = process.argv[3];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "tablet-boundary", width: 768, height: 900 },
  { name: "mobile-wide", width: 430, height: 932 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-narrow", width: 375, height: 812 },
].filter(({ name }) => !requestedViewport || name === requestedViewport);

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        for (const listener of this.listeners.get(message.method) || []) listener(message.params);
      }
    });
  }
  on(method, callback) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), callback]);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { this.socket.close(); }
}

async function launchChrome(viewport) {
  const profile = await mkdtemp(join(tmpdir(), `goodwin-footer-${viewport.name}-`));
  const process = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--autoplay-policy=user-gesture-required",
    `--window-size=${viewport.width},${viewport.height}`,
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const debuggerUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`chrome_timeout:${stderr}`)), 10_000);
    process.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    process.once("exit", (code) => reject(new Error(`chrome_exit:${code}:${stderr}`)));
  });
  const port = new URL(debuggerUrl).port;
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  return {
    page,
    close: async () => {
      process.kill("SIGTERM");
      await new Promise((resolve) => process.once("exit", resolve));
      await rm(profile, { recursive: true, force: true });
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(check, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error("browser_validation_timeout");
}

const results = [];
const allConsoleErrors = [];
const allNetworkFailures = [];
for (const viewport of viewports) {
  const browser = await launchChrome(viewport);
  const cdp = new CdpSession(browser.page.webSocketDebuggerUrl);
  const consoleErrors = allConsoleErrors;
  const networkFailures = allNetworkFailures;
  const requestUrls = new Map();
  let currentPage = "";
  try {
    await cdp.open();
    cdp.on("Runtime.consoleAPICalled", (event) => {
      if (event.type === "error") consoleErrors.push({ page: currentPage, text: event.args.map((arg) => arg.value ?? arg.description ?? "").join(" ") });
    });
    cdp.on("Runtime.exceptionThrown", (event) => consoleErrors.push({ page: currentPage, text: event.exceptionDetails.text }));
    cdp.on("Network.requestWillBeSent", (event) => requestUrls.set(event.requestId, event.request.url));
    cdp.on("Network.loadingFailed", (event) => {
      const url = requestUrls.get(event.requestId) || "";
      if (url.startsWith(origin) && !event.canceled) networkFailures.push({ page: currentPage, url, error: event.errorText });
    });
    cdp.on("Network.responseReceived", (event) => {
      if (event.response.url.startsWith(origin) && event.response.status >= 400) {
        networkFailures.push({ page: currentPage, url: event.response.url, status: event.response.status });
      }
    });
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const pagePath of pages) {
      currentPage = pagePath;
      const requestStart = requestUrls.size;
      await cdp.send("Page.navigate", { url: `${origin}${pagePath}` });
      await waitFor(() => evaluate(cdp, "document.readyState === 'complete'"));
      await new Promise((resolve) => setTimeout(resolve, 350));
      const initial = await evaluate(cdp, `({
        mapSvgs: document.querySelectorAll('#mission-map svg').length,
        trackingRequests: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/strava/public/tracking-status')).length,
        featureLinks: [...document.querySelectorAll('.feature-card')].map((node) => ({ text: node.innerText, href: node.getAttribute('href') })),
        intro: {
          exists: Boolean(document.querySelector('.mission-intro')),
          logoLoaded: Boolean(document.querySelector('.mission-intro-logo')?.complete && document.querySelector('.mission-intro-logo')?.naturalWidth),
          frameLoaded: [...document.querySelectorAll('.mission-intro-frame, .mission-intro-wipe-frame')].every((image) => image.complete && image.naturalWidth > 0),
          imageRequests: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /\\/assets\\/intro-(?:dubai-skyline-running|group-running|close-portrait|fence-stretch|solo-track-running)\\.jpg/.test(name)),
        }
      })`);
      if (pagePath === "/" && viewport.width <= 430) {
        const introScreenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(`/private/tmp/team-goodwin-intro-${viewport.name}.png`, Buffer.from(introScreenshot.data, "base64"));
      }
      await evaluate(cdp, `(() => {
        document.body.classList.remove('has-splash-modal-open');
        document.querySelector('[data-splash-modal]')?.remove();
        document.querySelector('footer')?.scrollIntoView({ block: 'start' });
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 350));
      const footer = await evaluate(cdp, `(() => {
        const boxes = [...document.querySelectorAll('.footer-social-group')].map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        const overlaps = boxes.some((box, index) => boxes.slice(index + 1).some((other) =>
          box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top));
        const visibleSocialLinks = [...document.querySelectorAll('.footer-social-link')].filter((node) => node.getClientRects().length > 0);
        const targetSizes = visibleSocialLinks.map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        const nav = document.querySelector('.site-footer-nav, .global-site-footer-nav');
        const navRect = nav?.getBoundingClientRect();
        const columns = nav ? [...nav.children].map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
        }) : [];
        const columnOverlap = columns.some((box, index) => columns.slice(index + 1).some((other) =>
          box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top));
        const columnsContained = !navRect || columns.every((box) => box.left >= navRect.left - 0.5 && box.right <= navRect.right + 0.5);
        const footer = document.querySelector('footer');
        const navigationItems = nav?.children[0] ? [...nav.children[0].children].map((node) => {
          const rect = node.getBoundingClientRect();
          return { text: node.textContent.trim(), left: rect.left, top: rect.top };
        }) : [];
        const textLinkLines = [...document.querySelectorAll('.footer-text-links a')]
          .filter((node) => /^(?:WilliamGoodge|TeamGoodwin)\.com$/.test(node.textContent.trim()))
          .map((node) => ({ text: node.textContent.trim(), lines: node.getClientRects().length }));
        const socialCenterOffsets = [...document.querySelectorAll('.footer-social-group')].map((group) => {
          const groupRect = group.getBoundingClientRect();
          const center = groupRect.left + groupRect.width / 2;
          return [...group.querySelectorAll('.footer-column-heading, .footer-social-links, .footer-text-links li')]
            .map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                node: node.className || node.textContent.trim(),
                offset: center - (rect.left + rect.width / 2),
                group: { left: groupRect.left, width: groupRect.width },
                rect: { left: rect.left, width: rect.width },
              };
            });
        }).flat();
        return {
          exists: Boolean(footer),
          background: footer ? getComputedStyle(footer).backgroundColor : null,
          willHeadings: document.querySelectorAll('#will-goodge-footer-heading').length,
          goodwinHeadings: document.querySelectorAll('#goodwin-footer-heading').length,
          socialLinks: visibleSocialLinks.length,
          targetSizes,
          visibleIconSizes: visibleSocialLinks.map((node) => {
            const rect = node.querySelector('.footer-social-icon').getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          }),
          socialColors: visibleSocialLinks.map((node) => getComputedStyle(node).color),
          textLinkColors: [...document.querySelectorAll('.footer-text-links a')].map((node) => getComputedStyle(node).color),
          overlaps,
          columnOverlap,
          columnsContained,
          columnWidths: columns.map(({ width }) => width),
          columns,
          navigationItems,
          textLinkLines,
          socialCenterOffsets,
          visibleSocialLabels: visibleSocialLinks.map((node) => node.getAttribute('aria-label')),
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
          hrefs: [...footer.querySelectorAll('a')].map((link) => link.getAttribute('href')),
          className: footer?.className,
          stylesheets: [...document.styleSheets].map((sheet) => sheet.href),
        };
      })()`);
      if (footer.background !== "rgb(10, 10, 10)") console.log(JSON.stringify({ viewport: viewport.name, pagePath, footer }, null, 2));
      assert.equal(footer.exists, true, `${viewport.name} ${pagePath}: footer missing`);
      assert.equal(footer.background, "rgb(10, 10, 10)", `${viewport.name} ${pagePath}: footer background`);
      assert.equal(footer.willHeadings, 1, `${viewport.name} ${pagePath}: Will heading`);
      assert.equal(footer.goodwinHeadings, 1, `${viewport.name} ${pagePath}: Goodwin heading`);
      const isMobile = viewport.width <= 430;
      assert.equal(footer.socialLinks, 6, `${viewport.name} ${pagePath}: social links`);
      assert.ok(footer.socialColors.every((color) => color === "rgb(255, 255, 255)"), `${viewport.name} ${pagePath}: social icon color`);
      assert.ok(footer.textLinkColors.every((color) => color === "rgba(255, 255, 255, 0.72)"), `${viewport.name} ${pagePath}: footer text-link color`);
      assert.equal(footer.overlaps, false, `${viewport.name} ${pagePath}: footer columns overlap`);
      assert.equal(footer.columnOverlap, false, `${viewport.name} ${pagePath}: footer grid columns overlap`);
      assert.equal(footer.columnsContained, true, `${viewport.name} ${pagePath}: footer grid column escaped`);
      assert.equal(footer.horizontalOverflow, false, `${viewport.name} ${pagePath}: horizontal overflow`);
      assert.deepEqual(footer.brokenImages, [], `${viewport.name} ${pagePath}: broken images`);
      assert.ok(footer.targetSizes.every(({ width, height }) => width >= 44 && height >= 44), `${viewport.name} ${pagePath}: touch target`);
      assert.ok(footer.visibleIconSizes.every(({ width, height }) => width === (isMobile ? 20 : 26) && height === (isMobile ? 20 : 26)), `${viewport.name} ${pagePath}: visible icon size`);
      if (isMobile) {
        const [navigation, will, goodwin] = footer.columns;
        assert.ok(Math.abs(will.top - goodwin.top) <= 1, `${viewport.name} ${pagePath}: social groups share top row`);
        assert.ok(Math.abs(will.width - goodwin.width) <= 1, `${viewport.name} ${pagePath}: social columns equal width`);
        assert.ok(navigation.top >= Math.max(will.bottom, goodwin.bottom) + 10, `${viewport.name} ${pagePath}: navigation is second row`);
        assert.deepEqual(footer.textLinkLines, [
          { text: "WilliamGoodge.com", lines: 1 },
          { text: "TeamGoodwin.com", lines: 1 },
        ]);
        assert.ok(footer.socialCenterOffsets.every(({ offset }) => Math.abs(offset) <= 1), `${viewport.name} ${pagePath}: social content centered ${JSON.stringify(footer.socialCenterOffsets)}`);
        assert.ok(footer.visibleSocialLabels.includes("Will Goodge on YouTube"), `${viewport.name} ${pagePath}: Will YouTube visible`);
        assert.ok(footer.visibleSocialLabels.includes("Goodwin on YouTube"), `${viewport.name} ${pagePath}: Goodwin YouTube visible`);
        const [theRun, liveMap, archive, fiftyRuns] = footer.navigationItems;
        assert.equal(theRun.text, "The Run");
        assert.equal(liveMap.text, "Live Map");
        assert.equal(archive.text, "Running Live Archive");
        assert.equal(fiftyRuns.text, "50 Runs, 50 States");
        assert.ok(Math.abs(theRun.left - archive.left) <= 1, `${viewport.name} ${pagePath}: first navigation column`);
        assert.ok(Math.abs(liveMap.left - fiftyRuns.left) <= 1, `${viewport.name} ${pagePath}: second navigation column`);
        assert.ok(Math.abs(theRun.top - liveMap.top) <= 1, `${viewport.name} ${pagePath}: first navigation row`);
        assert.ok(archive.top > theRun.top && fiftyRuns.top > liveMap.top, `${viewport.name} ${pagePath}: second navigation row`);
      }
      for (const href of [
        "https://www.instagram.com/williamgoodge/",
        "https://www.tiktok.com/@williamgoodge?_r=1&_t=ZP-99HtuOCkdiA",
        "https://www.youtube.com/@goodge",
        "https://www.linkedin.com/company/teamgoodwin/",
        "https://x.com/goteamgoodwin",
        "https://www.youtube.com/@goodwinsoftwarecompany",
        "https://teamgoodwin.com/",
        "mailto:run@teamgoodwin.com",
      ]) assert.ok(footer.hrefs.includes(href), `${viewport.name} ${pagePath}: missing ${href}`);
      if (pagePath === "/") {
        if (isMobile) {
          assert.equal(initial.intro.exists, true, `${viewport.name}: mobile intro exists`);
          assert.equal(initial.intro.logoLoaded, true, `${viewport.name}: mobile intro logo`);
          assert.equal(initial.intro.frameLoaded, true, `${viewport.name}: mobile intro frames`);
          assert.equal(new Set(initial.intro.imageRequests).size, 5, `${viewport.name}: mobile intro image requests`);
        } else {
          assert.equal(initial.intro.exists, false, `${viewport.name}: desktop/tablet intro disabled`);
        }
        if (viewport.name === "desktop") assert.equal(initial.mapSvgs, 0, `${viewport.name}: map lazy loading`);
        assert.equal(initial.trackingRequests, 0, `${viewport.name}: initial HAPN request`);
        assert.ok(initial.featureLinks.some(({ text, href }) => text.toLowerCase().includes("overview") && href === "/the-run/"));
        assert.ok(initial.featureLinks.some(({ text, href }) => text.toLowerCase().includes("athlete") && href === "/will/"));
        assert.ok(initial.featureLinks.some(({ text, href }) => text.toLowerCase().includes("world record attempt") && href === "/fifty-runs/"));

        await evaluate(cdp, "document.querySelector('.tracker-map-stage')?.scrollIntoView({block:'center'})");
        await waitFor(() => evaluate(cdp, "Boolean(document.querySelector('#mission-map svg'))"));
        await new Promise((resolve) => setTimeout(resolve, 800));
        const map = await evaluate(cdp, `({
          states: document.querySelectorAll('#mission-map .map-state').length,
          markers: document.querySelectorAll('#mission-map .map-stop').length,
          coreRoutes: document.querySelectorAll('#mission-map path.map-route.future, #mission-map path.map-route.complete:not(.map-activity-route), #mission-map path.map-route.rv').length,
          flightPaths: document.querySelectorAll('#mission-map path.map-route.flight').length,
          runner: document.querySelectorAll('#mission-map .map-entity-marker.runner').length,
          rv: document.querySelectorAll('#mission-map .map-entity-marker.rv').length,
          trackingRequests: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/strava/public/tracking-status')).length,
          stravaRequests: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/strava/public/races') || entry.name.includes('/strava/public/race-status')).map((entry) => entry.name),
        })`);
        assert.equal(map.states, 51, `${viewport.name}: states`);
        assert.equal(map.markers, 50, `${viewport.name}: race markers`);
        assert.equal(map.coreRoutes, 3, `${viewport.name}: core routes`);
        assert.equal(map.flightPaths, 5, `${viewport.name}: flight paths`);
        assert.equal(map.runner, 1, `${viewport.name}: runner`);
        assert.equal(map.rv, 1, `${viewport.name}: RV`);
        assert.equal(map.trackingRequests, 0, `${viewport.name}: pre-race HAPN request`);
        assert.ok(map.stravaRequests.length >= 2, `${viewport.name}: Strava public requests`);
        results.push({ viewport: viewport.name, page: pagePath, initial, footer, map });
      } else {
        results.push({ viewport: viewport.name, page: pagePath, initial, footer });
      }
      assert.ok(requestUrls.size >= requestStart, "network request bookkeeping");
    }

    currentPage = "/";
    await evaluate(cdp, "document.querySelector('footer')?.scrollIntoView({block:'start'})");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(`/private/tmp/team-goodwin-footer-${viewport.name}.png`, Buffer.from(screenshot.data, "base64"));
  } finally {
    cdp.close();
    await browser.close();
  }
}

assert.deepEqual(allConsoleErrors, []);
const knownProductionBaselineFailures = allNetworkFailures.filter(({ url }) =>
  url.endsWith("/favicon.ico")
  || url.endsWith("/api/instagram-feed")
  || /\/live-tracking\/assets\/(?:us-states-albers-10m\.json|map-rv-green-small\.png|map-runner-bobblehead-small\.png)$/.test(url));
const unexpectedFailures = allNetworkFailures.filter((failure) => !knownProductionBaselineFailures.includes(failure));
assert.deepEqual(unexpectedFailures, []);
console.log(JSON.stringify({
  pages: results.length,
  consoleErrors: 0,
  unexpectedFirstPartyFailures: 0,
  knownProductionBaselineFailures: knownProductionBaselineFailures.length,
  viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
  map: results.filter(({ map }) => map).map(({ viewport, initial, map }) => ({ viewport, initialMapSvgs: initial.mapSvgs, ...map })),
}, null, 2));
