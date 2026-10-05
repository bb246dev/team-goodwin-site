import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.argv[2] || "http://127.0.0.1:8770";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pages = ["/", "/live-tracking.html", "/partners.html", "/faq.html", "/updates.html", "/participation-terms.html"];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 430, height: 932 },
];

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { this.socket.close(); }
}

async function launchChrome(viewport) {
  const profile = await mkdtemp(join(tmpdir(), `goodwin-sponsor-${viewport.name}-`));
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    `--window-size=${viewport.width},${viewport.height}`,
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const debuggerUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`chrome_timeout:${stderr}`)), 10_000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once("exit", (code) => reject(new Error(`chrome_exit:${code}:${stderr}`)));
  });
  const targets = await fetch(`http://127.0.0.1:${new URL(debuggerUrl).port}/json/list`).then((response) => response.json());
  return {
    page: targets.find((target) => target.type === "page"),
    close: async () => {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
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
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error("browser_validation_timeout");
}

const expectedLabels = [
  "Visit Jet Excellence",
  "Visit Hertz",
  "Visit Bingo Jets",
  "Visit Moxy Hotels",
  "Visit Fontainebleau Miami Beach",
  "Visit Fontainebleau Las Vegas",
  "Visit Real SLX",
  "Visit Skyway Aviation",
];

const results = [];
for (const viewport of viewports) {
  const browser = await launchChrome(viewport);
  const cdp = new CdpSession(browser.page.webSocketDebuggerUrl);
  try {
    await cdp.open();
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
    for (const pagePath of pages) {
      await cdp.send("Page.navigate", { url: `${origin}${pagePath}` });
      await waitFor(() => evaluate(cdp, `location.pathname === ${JSON.stringify(pagePath)} && document.readyState === 'complete'`));
      await evaluate(cdp, `(() => {
        document.body.classList.remove('has-splash-modal-open');
        document.querySelector('[data-splash-modal]')?.remove();
        document.documentElement.style.scrollBehavior = 'auto';
        document.querySelectorAll('.site-footer-partners img,.global-site-footer-partners img').forEach((image) => { image.loading = 'eager'; });
        document.querySelector('.site-footer-partners,.global-site-footer-partners')?.scrollIntoView({block:'center'});
      })()`);
      await waitFor(() => evaluate(cdp, "[...document.querySelectorAll('.site-footer-partners img,.global-site-footer-partners img')].every((image) => image.complete)"));
      const footer = await evaluate(cdp, `(() => {
        const root = document.querySelector('footer');
        const wall = root.querySelector('.partner-logo-wall');
        const row = root.querySelector('.partner-logo-row-new');
        const rects = [...row.children].map((node) => {
          const rect = node.getBoundingClientRect();
          return {label:node.querySelector('a')?.getAttribute('aria-label'),left:rect.left,top:rect.top,width:rect.width,height:rect.height};
        });
        const columns = (node) => getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length;
        return {
          innerWidth: window.innerWidth,
          wallTemplate: getComputedStyle(wall).gridTemplateColumns,
          rowTemplate: getComputedStyle(row).gridTemplateColumns,
          title: document.title,
          itemCount: root.querySelectorAll('.partner-logo-item').length,
          labels: [...root.querySelectorAll('.partner-logo-item a')].map((node) => node.getAttribute('aria-label')),
          hrefs: [...root.querySelectorAll('.partner-logo-item a')].map((node) => node.getAttribute('href')),
          flyExclusive: root.innerHTML.toLowerCase().includes('flyexclusive'),
          incompleteImages: [...root.querySelectorAll('.site-footer-partners img,.global-site-footer-partners img')].filter((image) => !image.complete).map((image) => image.src),
          brokenImages: [...root.querySelectorAll('img')].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          wallColumns: columns(wall),
          rowColumns: columns(row),
          rowRect: (() => { const rect = row.getBoundingClientRect(); return {left:rect.left,width:rect.width}; })(),
          partnerRect: (() => { const rect = root.querySelector('.site-footer-partners,.global-site-footer-partners').getBoundingClientRect(); return {x:rect.left,y:rect.top + window.scrollY,width:rect.width,height:rect.height}; })(),
          rects,
          jetFilter: getComputedStyle(root.querySelector('img[src$="jet-excellence-footer.png"]')).filter,
        };
      })()`);

      assert.equal(footer.itemCount, 22, `${viewport.name} ${pagePath}: logo count`);
      assert.equal(footer.flyExclusive, false, `${viewport.name} ${pagePath}: FlyExclusive removed`);
      assert.deepEqual(footer.incompleteImages, [], `${viewport.name} ${pagePath}: sponsor images complete`);
      assert.deepEqual(footer.brokenImages, [], `${viewport.name} ${pagePath}: sponsor images`);
      assert.equal(footer.overflow, false, `${viewport.name} ${pagePath}: horizontal overflow`);
      assert.notEqual(footer.jetFilter, "none", `${viewport.name} ${pagePath}: Jet Excellence monochrome`);
      for (const label of expectedLabels) assert.ok(footer.labels.includes(label), `${viewport.name} ${pagePath}: ${label}`);
      if (pagePath === "/") assert.equal(footer.title, "Goodwin Generated Mission America Live Tracker | Goodwin");

      const byLabel = Object.fromEntries(footer.rects.map((rect) => [rect.label, rect]));
      if (viewport.name === "desktop") {
        assert.equal(footer.wallColumns, 5, `${pagePath}: desktop primary columns (${footer.innerWidth}px; ${footer.wallTemplate})`);
        assert.equal(footer.rowColumns, 5, `${pagePath}: desktop additional columns (${footer.innerWidth}px; ${footer.rowTemplate})`);
        assert.ok(Math.abs(byLabel["Visit Real SLX"].top - byLabel["Visit Skyway Aviation"].top) <= 1, `${pagePath}: final desktop row`);
        const finalCenter = (byLabel["Visit Real SLX"].left + byLabel["Visit Skyway Aviation"].left + byLabel["Visit Skyway Aviation"].width) / 2;
        const rowCenter = footer.rowRect.left + footer.rowRect.width / 2;
        assert.ok(Math.abs(finalCenter - rowCenter) <= 2, `${pagePath}: final desktop row centered`);
      } else {
        assert.equal(footer.wallColumns, 3, `${pagePath}: mobile primary columns`);
        assert.equal(footer.rowColumns, 6, `${pagePath}: mobile additional grid`);
        const miami = byLabel["Visit Fontainebleau Miami Beach"];
        const real = byLabel["Visit Real SLX"];
        const vegas = byLabel["Visit Fontainebleau Las Vegas"];
        assert.ok(Math.abs(miami.top - real.top) <= 1 && Math.abs(real.top - vegas.top) <= 1, `${pagePath}: Fontainebleau and Real SLX row`);
        assert.ok(miami.left < real.left && real.left < vegas.left, `${pagePath}: Real SLX centered between Fontainebleau properties`);
        const moxy = byLabel["Visit Moxy Hotels"];
        assert.ok(moxy.top > real.top, `${pagePath}: Moxy final mobile row`);
        assert.ok(Math.abs((moxy.left + moxy.width / 2) - (footer.rowRect.left + footer.rowRect.width / 2)) <= 2, `${pagePath}: Moxy centered`);
      }
      const screenshotRect = await evaluate(cdp, `(() => {
        const root = document.querySelector('footer');
        const partners = root.querySelector('.site-footer-partners,.global-site-footer-partners');
        for (const child of [...root.children]) if (child !== partners) child.remove();
        document.body.replaceChildren(root);
        root.style.margin = '0';
        root.style.width = '100%';
        root.style.maxWidth = 'none';
        window.scrollTo(0, 0);
        const rect = partners.getBoundingClientRect();
        return {x:rect.left,y:rect.top,width:rect.width,height:rect.height};
      })()`);
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: {...screenshotRect, scale:1} });
      const safePage = pagePath === "/" ? "home" : pagePath.replace(/^\//, "").replace(/\.html$/, "");
      const screenshotPath = `/private/tmp/team-goodwin-sponsor-${viewport.name}-${safePage}.png`;
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      results.push({ viewport: viewport.name, page: pagePath, screenshot: screenshotPath });
    }
  } finally {
    cdp.close();
    await browser.close();
  }
}

console.log(JSON.stringify({ verified: results.length, results }, null, 2));
