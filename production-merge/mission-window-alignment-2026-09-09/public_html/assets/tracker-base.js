    function initMobileNavigation() {
      const nav = document.querySelector(".tracker-nav");
      const toggle = document.querySelector(".tracker-menu-toggle");
      const navlinks = document.querySelector(".tracker-navlinks");
      if (!nav || !toggle || !navlinks) return;

      const closeMenu = () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation menu");
      };

      const openMenu = () => {
        nav.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", "Close navigation menu");
      };

      toggle.addEventListener("click", () => {
        if (nav.classList.contains("is-open")) {
          closeMenu();
        } else {
          openMenu();
        }
      });

      navlinks.addEventListener("click", (event) => {
        if (event.target.closest("a")) closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });

      window.matchMedia("(min-width: 769px)").addEventListener?.("change", closeMenu);
    }

    initMobileNavigation();

    function initDesktopNavFade() {
      const nav = document.querySelector(".tracker-nav");
      if (!nav) return;

      const desktopQuery = window.matchMedia("(min-width: 769px)");
      const updateNavFade = () => {
        nav.classList.toggle("is-scrolled", desktopQuery.matches && window.scrollY > 180);
      };

      updateNavFade();
      window.addEventListener("scroll", updateNavFade, { passive: true });
      desktopQuery.addEventListener?.("change", updateNavFade);
    }

    initDesktopNavFade();

    function initHeroVideoLoading() {
      const video = document.querySelector("[data-hero-video]");
      if (!video) return;

      const mobileQuery = window.matchMedia("(max-width: 768px)");
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const shouldSkipMobileVideo = () => (
        mobileQuery.matches
        && (
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
          || connection?.saveData
          || /(^|-)2g$/.test(connection?.effectiveType || "")
        )
      );

      const loadVideo = () => {
        if (video.dataset.loaded === "true") return;
        if (shouldSkipMobileVideo()) return;
        video.querySelectorAll("source[data-src]").forEach((source) => {
          source.src = source.dataset.src;
        });
        video.dataset.loaded = "true";
        video.load();
        video.play?.().catch(() => {});
      };

      const loadWhenIdle = () => {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(loadVideo, { timeout: 2600 });
        } else {
          window.setTimeout(loadVideo, 1800);
        }
      };

      if (!mobileQuery.matches) {
        loadVideo();
        return;
      }

      if (document.body.classList.contains("has-splash-modal-open")) {
        document.addEventListener("goodwin:splashclosed", loadWhenIdle, { once: true });
        return;
      }

      if (document.readyState === "complete") {
        loadWhenIdle();
      } else {
        window.addEventListener("load", loadWhenIdle, { once: true });
      }
    }

    initHeroVideoLoading();

    function initSplashModal() {
      const modal = document.querySelector("[data-splash-modal]");
      const storageKey = "goodwinSplashSeen";
      const hasSeenSplash = () => {
        try {
          return window.localStorage.getItem(storageKey) === "true";
        } catch {
          return false;
        }
      };
      const markSplashSeen = () => {
        try {
          window.localStorage.setItem(storageKey, "true");
        } catch {
          // The modal still closes when storage is unavailable.
        }
      };

      if (!modal) {
        document.body.classList.remove("has-splash-modal-open");
        return;
      }

      if (hasSeenSplash()) {
        document.body.classList.remove("has-splash-modal-open");
        document.dispatchEvent(new CustomEvent("goodwin:splashclosed"));
        return;
      }

      markSplashSeen();

      const close = () => {
        document.body.classList.remove("has-splash-modal-open");
        document.dispatchEvent(new CustomEvent("goodwin:splashclosed"));
      };

      modal.querySelectorAll("[data-splash-modal-close]").forEach((control) => {
        control.addEventListener("click", close);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && document.body.classList.contains("has-splash-modal-open")) {
          close();
        }
      });
    }

    initSplashModal();

    function initFaqCtaFilePreviewFallback() {
      if (window.location.protocol !== "file:") return;
      const faqCta = document.querySelector('#articles .inside-section-cta a[href="/faq/"]');
      if (!faqCta) return;
      faqCta.addEventListener("click", (event) => {
        event.preventDefault();
        const currentPath = window.location.pathname;
        const target = currentPath.includes("/source-html/")
          ? new URL("../dist/faq/index.html", window.location.href)
          : new URL("faq/index.html", window.location.href);
        window.location.href = target.href;
      });
    }

    initFaqCtaFilePreviewFallback();

    function initInsideMobileAccordion() {
      const accordion = document.querySelector("[data-inside-accordion]");
      if (!accordion) return;

      const triggers = Array.from(accordion.querySelectorAll(".inside-accordion-trigger"));
      const closePanel = (trigger) => {
        const panel = document.getElementById(trigger.getAttribute("aria-controls"));
        trigger.setAttribute("aria-expanded", "false");
        if (!panel) return;
        panel.setAttribute("aria-hidden", "true");
        panel.setAttribute("inert", "");
        panel.style.maxHeight = "0px";
        panel.classList.remove("is-open");
      };
      const openPanel = (trigger) => {
        const panel = document.getElementById(trigger.getAttribute("aria-controls"));
        trigger.setAttribute("aria-expanded", "true");
        if (!panel) return;
        panel.setAttribute("aria-hidden", "false");
        panel.removeAttribute("inert");
        panel.classList.add("is-open");
        panel.style.maxHeight = `${panel.scrollHeight}px`;
      };

      triggers.forEach(closePanel);
      triggers.forEach((trigger) => {
        trigger.addEventListener("click", () => {
          const isOpen = trigger.getAttribute("aria-expanded") === "true";
          triggers.forEach(closePanel);
          if (!isOpen) openPanel(trigger);
        });
        trigger.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          trigger.click();
        });
      });

      window.addEventListener("resize", () => {
        const openTrigger = accordion.querySelector('.inside-accordion-trigger[aria-expanded="true"]');
        if (openTrigger) openPanel(openTrigger);
      });
    }

    initInsideMobileAccordion();

    const MISSION_AMERICA_INTRO_CONFIG = {
      sessionKey: "missionAmericaIntroSeen",
      replayEachLoad: false,
      mobileQuery: "(max-width: 430px)",
      reducedMotionQuery: "(prefers-reduced-motion: reduce)",
      secondaryWipeDuration: 80,
      secondaryHold: 140,
      secondaryImages: [0, 1, 2, 3, 4],
      collapseDuration: 320,
      revealDuration: 1150,
      images: [
        {
          original: "[image] - 7479884.jpeg",
          file: "intro-dubai-skyline-running.jpg",
          position: "57% 54%",
          duration: 560,
          transform: "none"
        },
        {
          original: "[image] - 805936.jpeg",
          file: "intro-group-running.jpg",
          position: "48% 48%",
          duration: 500,
          transform: "none"
        },
        {
          original: "[image] - 965702.jpeg",
          file: "intro-close-portrait.jpg",
          position: "51% 42%",
          duration: 500,
          transform: "none"
        },
        {
          original: "[image] - 656212.jpeg",
          file: "intro-fence-stretch.jpg",
          position: "68% 50%",
          duration: 500,
          transform: "none"
        },
        {
          original: "[image] - 6327353.jpeg",
          file: "intro-solo-track-running.jpg",
          position: "42% 50%",
          duration: 580,
          transform: "none"
        }
      ]
    };

    function initMissionAmericaIntro() {
      const config = MISSION_AMERICA_INTRO_CONFIG;
      const mobileQuery = window.matchMedia(config.mobileQuery);
      const reducedMotionQuery = window.matchMedia(config.reducedMotionQuery);
      if (!mobileQuery.matches || reducedMotionQuery.matches) return;

      const forceReplay = new URLSearchParams(window.location.search).get("intro") === "1";
      try {
        if (!config.replayEachLoad && !forceReplay && window.localStorage.getItem(config.sessionKey) === "true") return;
      } catch (error) {
        if (!config.replayEachLoad && !forceReplay) return;
      }

      const logoSource = document.querySelector(".tracker-mark-mobile-logo")?.getAttribute("src") || "../assets/mission-america-logo.png";
      const assetBase = logoSource.replace(/mission-america-logo(?:-mobile)?\.png(?:\?.*)?$/, "");
      const firstIntroSource = `${assetBase}${config.images[0].file}`;
      const root = document.createElement("div");
      root.className = "mission-intro is-active";
      root.setAttribute("aria-hidden", "true");
      root.innerHTML = `
        <img class="mission-intro-logo" src="${logoSource}" alt="">
        <div class="mission-intro-stage">
          <img class="mission-intro-frame" alt="">
          <img class="mission-intro-wipe-frame" src="${firstIntroSource}" alt="" aria-hidden="true">
        </div>
        <svg class="mission-intro-burn-mask" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <filter id="mission-intro-burn-soften" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.8"></feGaussianBlur>
            </filter>
            <mask id="mission-intro-burn-mask-shape" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <rect width="100" height="100" fill="#fff"></rect>
              <ellipse class="mission-intro-burn-hole" cx="48" cy="52" rx="34" ry="28" filter="url(#mission-intro-burn-soften)"></ellipse>
            </mask>
          </defs>
          <rect class="mission-intro-burn-fill" width="100" height="100" mask="url(#mission-intro-burn-mask-shape)"></rect>
        </svg>
        <span class="mission-intro-reveal-rim" aria-hidden="true"></span>
      `;

      document.body.appendChild(root);
      document.body.classList.add("mission-intro-active");
      window.scrollTo(0, 0);

      if (!config.replayEachLoad && !forceReplay) {
        try {
          window.localStorage.setItem(config.sessionKey, "true");
        } catch (error) {}
      }

      const frame = root.querySelector(".mission-intro-frame");
      const wipeFrame = root.querySelector(".mission-intro-wipe-frame");
      const stage = root.querySelector(".mission-intro-stage");
      const sleep = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
      const imageUrl = (item) => `${assetBase}${item.file}`;
      const preload = (item) => new Promise((resolve) => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = resolve;
        image.src = imageUrl(item);
      });

      const finish = async () => {
        root.classList.add("is-hidden");
        document.body.classList.remove("mission-intro-active");
        window.scrollTo(0, 0);
        await sleep(180);
        root.remove();
      };

      mobileQuery.addEventListener?.("change", (event) => {
        if (!event.matches && document.body.contains(root)) finish();
      }, { once: true });

      (async () => {
        await preload(config.images[0]);
        config.images.slice(1).forEach(preload);

        for (const item of config.images) {
          frame.src = imageUrl(item);
          frame.style.objectPosition = item.position;
          frame.style.transform = item.transform;
          await sleep(item.duration);
        }

        const secondaryStart = config.images[config.secondaryImages[0]];
        frame.src = imageUrl(secondaryStart);
        frame.style.objectPosition = secondaryStart.position;
        frame.style.transform = "none";

        for (const imageIndex of config.secondaryImages.slice(1)) {
          const item = config.images[imageIndex];
          wipeFrame.classList.remove("is-wiping");
          wipeFrame.style.clipPath = "inset(100% 0 0 0)";
          wipeFrame.src = imageUrl(item);
          wipeFrame.style.objectPosition = item.position;
          wipeFrame.style.transform = "none";
          void wipeFrame.offsetWidth;
          wipeFrame.classList.add("is-wiping");
          await sleep(config.secondaryWipeDuration);
          frame.src = wipeFrame.src;
          frame.style.objectPosition = item.position;
          frame.style.transform = "none";
        }

        wipeFrame.classList.remove("is-wiping");
        wipeFrame.style.clipPath = "inset(100% 0 0 0)";
        await sleep(config.secondaryHold);
        stage.classList.add("is-collapsing");
        root.classList.add("is-collapsing");
        await sleep(config.collapseDuration);

        root.classList.remove("is-collapsing");
        root.classList.add("is-blooming");
        await sleep(config.revealDuration);
        await finish();
      })();
    }

    initMissionAmericaIntro();

    const missionUpdatesSheet = {
      endpoint: "https://docs.google.com/spreadsheets/d/1o6AH6YNdbc0_WkhAvBG96Vv0KglEpoPPzFtce92zlqc/gviz/tq",
      gid: "0",
      cacheKey: "goodwin-generated-mission-america-updates-v1",
      cacheMs: 2 * 60 * 1000
    };
    // Live tracking is disabled until an external tracking backend endpoint is configured.
    const LIVE_TRACKING_ENDPOINT = String(window.MISSION_LIVE_TRACKING_ENDPOINT || "").trim();
    const updatesDebug = new URLSearchParams(window.location.search).get("updatesDebug") === "1";

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function formatUpdateStamp(update) {
      return update.dateTime || [update.date, update.time].filter(Boolean).join(" | ");
    }

    function parseGoogleDate(value) {
      const match = String(value || "").match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
      if (!match) return Date.parse(value);
      return new Date(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4] || 0),
        Number(match[5] || 0),
        Number(match[6] || 0)
      ).getTime();
    }

    function isPublishedValue(value) {
      return value === true || String(value || "").trim().toLowerCase() === "true";
    }

    function googleCell(row, index, preferFormatted = true) {
      const cell = row?.c?.[index];
      if (!cell) return "";
      if (preferFormatted && cell.f != null && cell.f !== "") return cell.f;
      if (cell.v != null) return cell.v;
      if (cell.f != null) return cell.f;
      return "";
    }

    function validUpdateUrl(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      try {
        const url = new URL(raw, window.location.href);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
      } catch (error) {
        return "";
      }
    }

    function normalizeSheetUpdates(payload) {
      const table = payload?.table;
      const columns = Array.isArray(table?.cols) ? table.cols : [];
      const rows = Array.isArray(table?.rows) ? table.rows : [];
      const headerIndex = new Map(columns.map((column, index) => [String(column.label || "").trim(), index]));
      const required = ["Date/Time", "Headline", "Update", "Optional Link", "Published"];
      if (!required.every((header) => headerIndex.has(header))) {
        throw new Error("Google Sheet update headers are missing or renamed.");
      }
      return rows
        .map((row, index) => {
          const dateTime = String(googleCell(row, headerIndex.get("Date/Time")) || "").trim();
          const rawDate = googleCell(row, headerIndex.get("Date/Time"), false);
          const title = String(googleCell(row, headerIndex.get("Headline")) || "").trim();
          const body = String(googleCell(row, headerIndex.get("Update")) || "").trim();
          const link = validUpdateUrl(googleCell(row, headerIndex.get("Optional Link")));
          const published = isPublishedValue(googleCell(row, headerIndex.get("Published"), false));
          const sortValue = parseGoogleDate(rawDate || dateTime);
          return {
            dateTime,
            title,
            body,
            link,
            published,
            sortValue: Number.isFinite(sortValue) ? sortValue : 0,
            sourceIndex: index
          };
        })
        .filter((update) => update.published && (update.dateTime || update.title || update.body || update.link))
        .sort((a, b) => (b.sortValue - a.sortValue) || (b.sourceIndex - a.sourceIndex));
    }

    function readCachedSheetUpdates(allowExpired = false) {
      try {
        const cached = JSON.parse(localStorage.getItem(missionUpdatesSheet.cacheKey) || "null");
        if (!cached || !Array.isArray(cached.updates)) return null;
        if (!allowExpired && Date.now() - Number(cached.savedAt || 0) > missionUpdatesSheet.cacheMs) return null;
        return cached.updates;
      } catch (error) {
        return null;
      }
    }

    function writeCachedSheetUpdates(updates) {
      try {
        localStorage.setItem(missionUpdatesSheet.cacheKey, JSON.stringify({ savedAt: Date.now(), updates }));
      } catch (error) {
        console.warn(error);
      }
    }

    function requestSheetUpdates() {
      return new Promise((resolve, reject) => {
        const callbackName = `__goodwinMissionUpdates${Date.now()}${Math.random().toString(36).slice(2)}`;
        const params = new URLSearchParams({
          gid: missionUpdatesSheet.gid,
          tqx: `out:json;responseHandler:${callbackName}`,
          cacheBust: String(Date.now())
        });
        const script = document.createElement("script");
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error("Google Sheet updates request timed out."));
        }, 10000);
        const cleanup = () => {
          window.clearTimeout(timeout);
          delete window[callbackName];
          script.remove();
        };
        window[callbackName] = (payload) => {
          cleanup();
          resolve(payload);
        };
        script.onerror = () => {
          cleanup();
          reject(new Error("Google Sheet updates request failed."));
        };
        script.src = `${missionUpdatesSheet.endpoint}?${params.toString()}`;
        document.head.appendChild(script);
      });
    }

    async function loadSheetUpdates({ bypassCache = false } = {}) {
      const cached = updatesDebug || bypassCache ? null : readCachedSheetUpdates();
      if (cached) return cached;
      try {
        const updates = normalizeSheetUpdates(await requestSheetUpdates());
        writeCachedSheetUpdates(updates);
        return updates;
      } catch (error) {
        console.warn(error);
        const stale = readCachedSheetUpdates(true);
        if (stale) return stale;
        throw error;
      }
    }

    function renderUpdateTitle(update) {
      if (!update.link) return `<strong>${escapeHtml(update.title)}</strong>`;
      const url = new URL(update.link, window.location.href);
      const externalAttributes = url.origin === window.location.origin ? "" : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${escapeHtml(update.link)}"${externalAttributes}><strong>${escapeHtml(update.title)}</strong></a>`;
    }

    function renderTickerUnavailable() {
      const item = '<div class="ticker-item"><time>Updates</time><span>Latest updates are temporarily unavailable.</span></div>';
      return item + item;
    }

    function renderTickerEmpty() {
      const item = '<div class="ticker-item"><time>Updates</time><span>Updates from the road are coming.</span></div>';
      return item + item;
    }

    let missionTrackingStatusPromise = null;

    async function loadMissionTrackingStatus() {
      if (!LIVE_TRACKING_ENDPOINT) return null;
      if (missionTrackingStatusPromise) return missionTrackingStatusPromise;
      missionTrackingStatusPromise = (async () => {
        try {
          const response = await fetch(LIVE_TRACKING_ENDPOINT, { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error(`Tracking status returned ${response.status}`);
          const status = await response.json();
          if (status?.flightStatus) window.missionPublicFlightStatus = status.flightStatus;
          if (Number.isFinite(Number(status?.progress))) {
            window.missionMapTracking = {
              ...(window.missionMapTracking || {}),
              runner: { ...(window.missionMapTracking?.runner || {}), progress: Number(status.progress) }
            };
          }
          if (status?.flightStatus?.active) {
            const flight = status.flightStatus;
            window.missionMapTracking = {
              ...(window.missionMapTracking || {}),
              flight: {
                active: true,
                fromStop: flight.originStop,
                toStop: flight.destinationStop,
                progress: Number(flight.progress) || 0,
                status: flight.status,
                nextStop: flight.nextStop
              }
            };
          }
          return status;
        } catch (error) {
          console.warn(error);
          return null;
        }
      })();
      return missionTrackingStatusPromise;
    }

    function liveTickerUpdateFromStatus(status) {
      const flight = status?.flightStatus || window.missionPublicFlightStatus;
      if (!flight?.active) return null;
      const destination = flight.nextStop || flight.destinationCity;
      if (flight.status === "IN TRANSIT" && destination) {
        return { date: "Live", time: "", title: "In transit", body: `Next stop: ${destination}.` };
      }
      if (flight.status === "ARRIVED" && destination) {
        return { date: "Live", time: "", title: "Arrived", body: `Ground transfer toward ${destination}.` };
      }
      if ((flight.status === "DELAYED" || flight.status === "TRAVEL UPDATE") && destination) {
        return { date: "Live", time: "", title: flight.status === "DELAYED" ? "Delayed" : "Travel update", body: `Next stop: ${destination}.` };
      }
      return null;
    }

    async function loadTickerUpdates(options = {}) {
      const ticker = document.querySelector("[data-ticker-items]");
      if (!ticker) return;
      await loadMissionTrackingStatus();
      let updates = [];
      try {
        updates = await loadSheetUpdates(options);
      } catch (error) {
        ticker.innerHTML = renderTickerUnavailable();
        return;
      }
      const latestUpdates = updates.slice(0, 3);
      if (!latestUpdates.length) {
        ticker.innerHTML = renderTickerEmpty();
        return;
      }
      const rendered = latestUpdates.map((update) => `
        <div class="ticker-item">
          <time>${escapeHtml(formatUpdateStamp(update))}</time>
          <span>${renderUpdateTitle(update)} ${escapeHtml(update.body)}</span>
        </div>
      `).join("");
      ticker.innerHTML = rendered + rendered;
    }

    loadTickerUpdates();
    window.setInterval(() => loadTickerUpdates({ bypassCache: true }), missionUpdatesSheet.cacheMs);

    const instagramProfileUrl = "https://www.instagram.com/williamgoodge?igsi=amphOWpyaXdubzE=";

    function formatInstagramDate(value) {
      if (!value) return "Instagram";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Instagram";
      const days = Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
      if (days === 0) return "Today";
      if (days === 1) return "1 day ago";
      return `${days} days ago`;
    }

    function normalizeInstagramMedia(payload) {
      const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      return items
        .filter((item) => {
          const type = String(item.media_type || item.mediaType || "").toUpperCase();
          return type === "IMAGE" || type === "CAROUSEL_ALBUM" || (!type && (item.media_url || item.mediaUrl));
        })
        .map((item) => ({
          id: item.id,
          mediaUrl: item.media_url || item.mediaUrl || item.thumbnail_url || item.thumbnailUrl,
          permalink: item.permalink || instagramProfileUrl,
          caption: item.caption || "Recent William Goodge Instagram image",
          timestamp: item.timestamp
        }))
        .filter((item) => item.mediaUrl)
        .slice(0, 8);
    }

    async function loadInstagramFeed() {
      const container = document.querySelector("[data-instagram-feed]");
      if (!container) return;
      const endpoint = window.MISSION_INSTAGRAM_FEED_URL || container.dataset.endpoint;

      try {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Instagram feed returned ${response.status}`);
        const media = normalizeInstagramMedia(await response.json());
        if (media.length < 8) throw new Error("Instagram feed did not return eight image posts");

        container.innerHTML = media.map((item) => `
          <a href="${item.permalink}" target="_blank" rel="noopener noreferrer">
            <img src="${item.mediaUrl}" alt="${item.caption.replace(/"/g, "&quot;")}" loading="lazy">
          </a>
        `).join("");
      } catch (error) {
        container.dataset.feedStatus = "using-cached-feed";
        if (!String(error?.message || "").includes("Instagram feed returned 404")) {
          console.warn(error);
        }
      }
    }

    loadInstagramFeed();

    function initWordmarkFade() {
      const wordmark = document.querySelector(".tracker-mark");
      if (!wordmark) return;

      const preserveMobile = window.matchMedia("(max-width: 760px)");
      let ticking = false;

      const updateOpacity = () => {
        ticking = false;
        if (preserveMobile.matches) {
          wordmark.style.setProperty("--wordmark-opacity", "0.6");
          return;
        }

        const scrollProgress = Math.min(1, Math.max(0, window.scrollY / 260));
        const opacity = 0.6 - scrollProgress * 0.2;
        wordmark.style.setProperty("--wordmark-opacity", opacity.toFixed(3));
      };

      const requestUpdate = () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateOpacity);
      };

      updateOpacity();
      window.addEventListener("scroll", requestUpdate, { passive: true });
      preserveMobile.addEventListener?.("change", updateOpacity);
    }

    initWordmarkFade();

    const staticRouteStops = [
      { n: 1, state: "Hawaii", abbr: "HI", city: "Honolulu", date: "Oct 9", lat: 21.3099, lng: -157.8581 },
      { n: 2, state: "Alaska", abbr: "AK", city: "Anchorage", date: "Oct 10", lat: 61.2181, lng: -149.9003 },
      { n: 3, state: "Oregon", abbr: "OR", city: "Portland", date: "Oct 10", lat: 45.5152, lng: -122.6784 },
      { n: 4, state: "Washington", abbr: "WA", city: "Vancouver", date: "Oct 11", lat: 45.6387, lng: -122.6615 },
      { n: 5, state: "Utah", abbr: "UT", city: "Salt Lake City", date: "Oct 11", lat: 40.7608, lng: -111.891 },
      { n: 6, state: "Idaho", abbr: "ID", city: "Idaho Falls", date: "Oct 12", lat: 43.4917, lng: -112.0339 },
      { n: 7, state: "Montana", abbr: "MT", city: "Bozeman", date: "Oct 12", lat: 45.677, lng: -111.0429 },
      { n: 8, state: "North Dakota", abbr: "ND", city: "Bowman", date: "Oct 13", lat: 46.1828, lng: -103.3946 },
      { n: 9, state: "South Dakota", abbr: "SD", city: "Keystone", date: "Oct 13", lat: 43.8919, lng: -103.4288 },
      { n: 10, state: "Wyoming", abbr: "WY", city: "Sundance", date: "Oct 14", lat: 44.4061, lng: -104.3752 },
      { n: 11, state: "Nebraska", abbr: "NE", city: "Morrill", date: "Oct 14", lat: 41.9636, lng: -103.9249 },
      { n: 12, state: "Colorado", abbr: "CO", city: "Denver", date: "Oct 15", lat: 39.7392, lng: -104.9903 },
      { n: 13, state: "New Mexico", abbr: "NM", city: "Albuquerque", date: "Oct 15", lat: 35.0844, lng: -106.6504 },
      { n: 14, state: "Texas", abbr: "TX", city: "Dallas", date: "Oct 16", lat: 32.7767, lng: -96.797 },
      { n: 15, state: "Oklahoma", abbr: "OK", city: "Afton", date: "Oct 16", lat: 36.6928, lng: -94.9613 },
      { n: 16, state: "Kansas", abbr: "KS", city: "Kansas City", date: "Oct 17", lat: 39.1142, lng: -94.6275 },
      { n: 17, state: "Missouri", abbr: "MO", city: "Kansas City", date: "Oct 17", lat: 39.0997, lng: -94.5786 },
      { n: 18, state: "Minnesota", abbr: "MN", city: "Minneapolis", date: "Oct 17", lat: 44.9778, lng: -93.265 },
      { n: 19, state: "Iowa", abbr: "IA", city: "Lansing", date: "Oct 18", lat: 43.2406, lng: -91.2046 },
      { n: 20, state: "Wisconsin", abbr: "WI", city: "De Soto", date: "Oct 18", lat: 43.4239, lng: -91.1971 },
      { n: 21, state: "Illinois", abbr: "IL", city: "Chicago", date: "Oct 19", lat: 41.8781, lng: -87.6298 },
      { n: 22, state: "Indiana", abbr: "IN", city: "South Bend", date: "Oct 19", lat: 41.6764, lng: -86.252 },
      { n: 23, state: "Michigan", abbr: "MI", city: "Sturgis", date: "Oct 19", lat: 41.7992, lng: -85.4194 },
      { n: 24, state: "Ohio", abbr: "OH", city: "Columbus", date: "Oct 20", lat: 39.9612, lng: -82.9988 },
      { n: 25, state: "Arizona", abbr: "AZ", city: "Willow Beach / Hoover Dam", date: "Oct 20", lat: 35.8755, lng: -114.6608 },
      { n: 26, state: "California", abbr: "CA", city: "Los Angeles", date: "Oct 21", lat: 34.0522, lng: -118.2437 },
      { n: 27, state: "Nevada", abbr: "NV", city: "Las Vegas", date: "Oct 21", lat: 36.1699, lng: -115.1398 },
      { n: 28, state: "Arkansas", abbr: "AR", city: "Little Rock", date: "Oct 22", lat: 34.7465, lng: -92.2896 },
      { n: 29, state: "Louisiana", abbr: "LA", city: "Shreveport", date: "Oct 22", lat: 32.5252, lng: -93.7502 },
      { n: 30, state: "Mississippi", abbr: "MS", city: "Meridian", date: "Oct 23", lat: 32.3643, lng: -88.7037 },
      { n: 31, state: "Alabama", abbr: "AL", city: "Tuscaloosa", date: "Oct 23", lat: 33.2098, lng: -87.5692 },
      { n: 32, state: "Florida", abbr: "FL", city: "Miami", date: "Oct 24", lat: 25.7617, lng: -80.1918 },
      { n: 33, state: "Georgia", abbr: "GA", city: "Atlanta", date: "Oct 24", lat: 33.749, lng: -84.388 },
      { n: 34, state: "South Carolina", abbr: "SC", city: "Greenville", date: "Oct 25", lat: 34.8526, lng: -82.394 },
      { n: 35, state: "North Carolina", abbr: "NC", city: "Asheville", date: "Oct 25", lat: 35.5951, lng: -82.5515 },
      { n: 36, state: "Tennessee", abbr: "TN", city: "Pigeon Forge", date: "Oct 25", lat: 35.7884, lng: -83.5543 },
      { n: 37, state: "Virginia", abbr: "VA", city: "Norton", date: "Oct 26", lat: 36.9337, lng: -82.629 },
      { n: 38, state: "Kentucky", abbr: "KY", city: "Pikeville", date: "Oct 26", lat: 37.4793, lng: -82.5187 },
      { n: 39, state: "West Virginia", abbr: "WV", city: "Hazelton", date: "Oct 27", lat: 39.6534, lng: -79.6584 },
      { n: 40, state: "Maryland", abbr: "MD", city: "Elkton", date: "Oct 27", lat: 39.6068, lng: -75.8332 },
      { n: 41, state: "Delaware", abbr: "DE", city: "Glasgow", date: "Oct 28", lat: 39.601, lng: -75.7466 },
      { n: 42, state: "Pennsylvania", abbr: "PA", city: "Philadelphia", date: "Oct 28", lat: 39.9526, lng: -75.1652 },
      { n: 43, state: "New Jersey", abbr: "NJ", city: "Teterboro", date: "Oct 29", lat: 40.8576, lng: -74.0608 },
      { n: 44, state: "Connecticut", abbr: "CT", city: "Stamford", date: "Oct 29", lat: 41.0534, lng: -73.5387 },
      { n: 45, state: "Rhode Island", abbr: "RI", city: "Providence", date: "Oct 30", lat: 41.824, lng: -71.4128 },
      { n: 46, state: "Massachusetts", abbr: "MA", city: "Boston", date: "Oct 30", lat: 42.3601, lng: -71.0589 },
      { n: 47, state: "Vermont", abbr: "VT", city: "Brattleboro", date: "Oct 30", lat: 42.8509, lng: -72.5579 },
      { n: 48, state: "New Hampshire", abbr: "NH", city: "Portsmouth", date: "Oct 31", lat: 43.0718, lng: -70.7626 },
      { n: 49, state: "Maine", abbr: "ME", city: "Kittery", date: "Oct 31", lat: 43.0895, lng: -70.7448 },
      { n: 50, state: "New York", abbr: "NY", city: "New York City", date: "Nov 1", lat: 40.7128, lng: -74.006 }
    ];

    let routeStops = staticRouteStops;
    let missionRaceStatus = { source: "static", active: false, completedRaces: 0, totalRaces: 50 };
    let missionRaceMapModule = null;
    let missionMapTopology = null;
    let missionRacePoller = null;
    let missionHapnPoller = null;
    let missionHapnRaceStatus = null;
    let missionHapnLivePosition = null;
    let missionMapLoadPromise = null;
    const MISSION_WINDOW_START = "2026-10-09T09:00:00-04:00";
    const MISSION_WINDOW_END = "2026-11-01T23:59:59-05:00";
    const startDate = new Date(MISSION_WINDOW_START);
    const endDate = new Date(MISSION_WINDOW_END);
    const pageNowMs = Date.now();
    const userProgress = Number(window.missionTrackingProgress);
    const dateProgress = (pageNowMs - startDate.getTime()) / (endDate.getTime() - startDate.getTime());
    const previewProgress = 0;
    const progress = Number.isFinite(userProgress)
      ? userProgress
      : pageNowMs < startDate.getTime()
        ? previewProgress
        : Math.max(0, Math.min(1, dateProgress));

    function missionMapProgress() {
      const suppliedProgress = Number(window.missionTrackingProgress);
      if (Number.isFinite(suppliedProgress)) return Math.max(0, Math.min(1, suppliedProgress));
      if (missionRaceStatus.source !== "api") return progress;
      const total = Number(missionRaceStatus.totalRaces) || 50;
      return Math.max(0, Math.min(1, Number(missionRaceStatus.completedRaces) / total || 0));
    }

    function interpolateRoute(progressValue) {
      const routePosition = progressValue * (routeStops.length - 1);
      const segmentIndex = Math.min(routeStops.length - 2, Math.max(0, Math.floor(routePosition)));
      const segmentProgress = routePosition - segmentIndex;
      const start = routeStops[segmentIndex];
      const end = routeStops[segmentIndex + 1];
      const livePoint = {
        lat: start.lat + (end.lat - start.lat) * segmentProgress,
        lng: start.lng + (end.lng - start.lng) * segmentProgress
      };
      return { segmentIndex, livePoint };
    }

    const mapAssetBase = location.pathname.includes("/source-html/") ? "../assets/" : "assets/";
    const mapEntityAssets = {
      runner: `${mapAssetBase}map-runner-bobblehead-small.png`,
      rv: `${mapAssetBase}map-rv-green-small.png`
    };
    const mapTrackingDefaults = {
      runner: { progress },
      flight: { active: false },
      rv: { pathStops: [3, 4, 5, 6], progress: 0.64 }
    };
    const MAP_FLIGHT_PREVIEW = false;
    const flightAirports = {
      HNL: { lat: 21.3187, lng: -157.9225, insetOffset: [6, 2] },
      ANC: { lat: 61.1743, lng: -149.9985, insetOffset: [5, -4] },
      PDX: { lat: 45.5898, lng: -122.5951 },
      SLC: { lat: 40.7899, lng: -111.9791 },
      CMH: { lat: 39.9980, lng: -82.8919 },
      LAX: { lat: 33.9416, lng: -118.4085 },
      MIA: { lat: 25.7959, lng: -80.2870 },
      ATL: { lat: 33.6407, lng: -84.4277 }
    };
    const flightItinerary = [
      { date: "Oct 9", from: "HNL", to: "ANC", time: "11:11 PM - 7:22 AM", airline: "Alaska Airlines" },
      { date: "Oct 10", from: "ANC", to: "PDX", time: "3:51 PM - 8:35 PM", airline: "Alaska Airlines" },
      { date: "Oct 11", from: "PDX", to: "SLC", time: "5:15 PM - 8:10 PM", airline: "Delta Airlines" },
      { date: "Oct 20", from: "CMH", to: "LAX", time: "7:03 PM - 9:11 PM", airline: "American Airlines" },
      { date: "Oct 24", from: "MIA", to: "ATL", time: "4:21 PM - 6:24 PM", airline: "Delta Airlines" }
    ];
    const RUN_WITH_WILL_FORM_URL = "https://tally.so/r/lbE0jN";

    function getRunWithWillId(stop) {
      return `run-${String(stop.n).padStart(2, "0")}`;
    }

    function getRunWithWillUrl(stop) {
      const params = new URLSearchParams({
        run_id: getRunWithWillId(stop),
        city: stop.city,
        state: stop.state,
        date: stop.date
      });
      return `${RUN_WITH_WILL_FORM_URL}?${params.toString()}`;
    }

    function getRunAnalyticsPayload(stop) {
      return {
        run_id: getRunWithWillId(stop),
        city: stop.city,
        state: stop.state,
        date: stop.date
      };
    }

    function trackAnalyticsEvent(name, params = {}) {
      try {
        if (typeof window.gtag === "function") {
          window.gtag("event", name, params);
        }
      } catch (error) {
        // Analytics must never interrupt navigation or map interaction.
      }
    }

    function missionWindowStateAt(nowMs) {
      if (nowMs < startDate.getTime()) return "countdown";
      if (nowMs <= endDate.getTime()) return "active";
      return "complete";
    }

    function updateCountdown(nowMs = Date.now()) {
      const state = missionWindowStateAt(nowMs);
      const displayedMilliseconds = state === "countdown"
        ? startDate.getTime() - nowMs
        : Math.min(nowMs, endDate.getTime()) - startDate.getTime();
      const days = Math.floor(displayedMilliseconds / 86400000);
      const hours = Math.floor((displayedMilliseconds % 86400000) / 3600000);
      const minutes = Math.floor((displayedMilliseconds % 3600000) / 60000);
      const seconds = Math.floor((displayedMilliseconds % 60000) / 1000);
      document.getElementById("countdown-days").textContent = String(days).padStart(2, "0");
      document.getElementById("countdown-hours").textContent = String(hours).padStart(2, "0");
      document.getElementById("countdown-minutes").textContent = String(minutes).padStart(2, "0");
      document.getElementById("countdown-seconds").textContent = String(seconds).padStart(2, "0");
      const clock = document.querySelector("[data-countdown-clock]");
      const loading = document.querySelector("[data-countdown-loading]");
      const heading = clock?.closest(".tracker-panel")?.querySelector(".tracker-panel-heading");
      if (heading) {
        heading.textContent = state === "countdown"
          ? "Countdown to race day"
          : state === "active"
            ? "RACE IS ON"
            : "MISSION COMPLETE";
      }
      if (clock) {
        clock.classList.remove("is-loading");
        clock.classList.add("is-ready");
        clock.setAttribute("aria-busy", "false");
        clock.dataset.missionClockState = state;
      }
      if (loading) {
        loading.setAttribute("hidden", "");
      }
      return state;
    }

    let rsvpMobileMode = "select";
    let selectedRouteStop = "";
    const rsvpDesktopQuery = window.matchMedia("(min-width: 769px)");

    function getRouteStopMarkup(stop) {
      return `
        <article class="run-card">
          <div class="route-number">${String(stop.n).padStart(2, "0")}</div>
          <div>
            <div class="tracker-eyebrow">${stop.date} · ${stop.state}</div>
            <h3>${stop.city}</h3>
          </div>
          ${stop.n === 50 ? "" : `<div class="button-row"><a class="tracker-button secondary" href="${getRunWithWillUrl(stop)}" data-rsvp-link data-run-number="${stop.n}">RSVP</a></div>`}
        </article>
      `;
    }

    function getSelectedRouteStopMarkup(stop) {
      return `
        <article class="run-card">
          <div class="rsvp-selected-stop-label">
            <span class="rsvp-selected-stop-date">${stop.date} - ${stop.city}</span>
          </div>
          <div class="button-row"><a class="tracker-button secondary" href="${getRunWithWillUrl(stop)}" data-rsvp-link data-run-number="${stop.n}">RSVP</a></div>
        </article>
      `;
    }

    function attachRsvpTracking(container) {
      container.querySelectorAll("[data-rsvp-link]").forEach((link) => {
        link.addEventListener("click", () => {
          const stop = routeStops.find((item) => String(item.n) === link.dataset.runNumber);
          if (stop) trackAnalyticsEvent("rsvp_click", getRunAnalyticsPayload(stop));
        });
      });
    }

    function populateRsvpMobileControls() {
      const select = document.querySelector("[data-rsvp-state-select]");
      if (!select || select.dataset.populated === "true") return;
      select.innerHTML = '<option value="">Select your state</option>' + routeStops.map((stop) => (
        `<option value="${stop.n}">${stop.date} — ${stop.city}, ${stop.abbr}</option>`
      )).join("");
      select.dataset.populated = "true";
      select.addEventListener("change", () => {
        selectedRouteStop = select.value;
        rsvpMobileMode = selectedRouteStop ? "selected" : "select";
        renderRunItinerary();
      });

      const viewAll = document.querySelector("[data-rsvp-view-all]");
      if (viewAll) {
        viewAll.addEventListener("click", () => {
          rsvpMobileMode = "all";
          renderRunItinerary();
        });
      }
    }

    function renderRunItinerary() {
      const container = document.querySelector("[data-route-itinerary]");
      if (!container) return;
      populateRsvpMobileControls();
      const rsvpMode = rsvpDesktopQuery.matches ? "all" : rsvpMobileMode;
      container.classList.toggle("is-expanded", rsvpMode === "all");
      container.classList.toggle("is-selected", rsvpMode === "selected");

      if (rsvpMode === "all") {
        container.innerHTML = routeStops.map(getRouteStopMarkup).join("");
        attachRsvpTracking(container);
        return;
      }

      if (selectedRouteStop) {
        const selectedStop = routeStops.find((stop) => String(stop.n) === selectedRouteStop);
        container.innerHTML = selectedStop ? getSelectedRouteStopMarkup(selectedStop) : "";
        attachRsvpTracking(container);
        return;
      }

      container.innerHTML = "";
    }

    const initialMissionClockState = updateCountdown();
    renderRunItinerary();
    rsvpDesktopQuery.addEventListener?.("change", renderRunItinerary);
    let missionClockTimer = null;
    if (initialMissionClockState !== "complete") {
      missionClockTimer = window.setInterval(() => {
        if (updateCountdown() === "complete") {
          window.clearInterval(missionClockTimer);
          missionClockTimer = null;
        }
      }, 1000);
    }

    const stateAbbr = {
      Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY"
    };

    function decodeTopology(topo) {
      const arcCache = new Map();
      const { scale, translate } = topo.transform;
      const decodeArc = (index) => {
        const key = String(index);
        if (arcCache.has(key)) return arcCache.get(key);
        const source = topo.arcs[index < 0 ? ~index : index];
        let x = 0;
        let y = 0;
        const points = source.map((point) => {
          x += point[0];
          y += point[1];
          return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
        });
        const decoded = index < 0 ? points.reverse() : points;
        arcCache.set(key, decoded);
        return decoded;
      };

      const ringPoints = (ring) => ring.flatMap((arcIndex, arcPosition) => {
        const points = decodeArc(arcIndex);
        return arcPosition === 0 ? points : points.slice(1);
      });

      const ringToPath = (ring) => {
        const points = ringPoints(ring);
        if (!points.length) return "";
        return `M${points.map((point) => point.join(",")).join("L")}Z`;
      };

      const polygonToPath = (polygon) => polygon.map(ringToPath).join("");
      const geometryToPath = (geometry) => geometry.type === "Polygon"
        ? polygonToPath(geometry.arcs)
        : geometry.arcs.map(polygonToPath).join("");

      const polygonCentroid = (ring) => {
        const points = ringPoints(ring);
        let area = 0;
        let x = 0;
        let y = 0;
        for (let i = 0, length = points.length; i < length; i++) {
          const current = points[i];
          const next = points[(i + 1) % length];
          const cross = current[0] * next[1] - next[0] * current[1];
          area += cross;
          x += (current[0] + next[0]) * cross;
          y += (current[1] + next[1]) * cross;
        }
        if (!area) {
          const total = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
          return [total[0] / points.length, total[1] / points.length];
        }
        return [x / (3 * area), y / (3 * area)];
      };

      const bestCentroid = (geometry) => {
        const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
        const largest = polygons
          .map((polygon) => polygon[0])
          .filter(Boolean)
          .map((ring) => ({ ring, points: ringPoints(ring) }))
          .sort((a, b) => b.points.length - a.points.length)[0];
        return largest ? polygonCentroid(largest.ring) : [0, 0];
      };

      return { geometryToPath, bestCentroid };
    }

    function routePath(points) {
      return points.length ? `M${points.map((point) => point.join(",")).join("L")}` : "";
    }

    const flightTransitions = [
      { fromStop: 1, toStop: 2 },
      { fromStop: 2, toStop: 3 },
      { fromStop: 4, toStop: 5 },
      { fromStop: 24, toStop: 26, groundExclusions: ["24-25", "25-26"] },
      { fromStop: 32, toStop: 33 }
    ];
    const flightGroundTransitionKeys = new Set(
      flightTransitions.flatMap(({ fromStop, toStop, groundExclusions }) => groundExclusions || [`${fromStop}-${toStop}`])
    );
    const flightDepartureStopNumbers = new Set(flightTransitions.map(({ fromStop }) => fromStop));

    function routeTransitionKey(fromStop, toStop) {
      return `${fromStop?.n}-${toStop?.n}`;
    }

    function stopOutboundMode(stop) {
      return flightDepartureStopNumbers.has(Number(stop?.n)) ? "flight" : "rv";
    }

    function routePathWithoutFlightTransitions(points, stops) {
      const segments = [];
      for (let index = 1; index < points.length; index += 1) {
        const fromStop = stops[index - 1];
        const toStop = stops[index];
        if (flightGroundTransitionKeys.has(routeTransitionKey(fromStop, toStop))) continue;
        segments.push(`M${points[index - 1].join(",")}L${points[index].join(",")}`);
      }
      return segments.join("");
    }

    const mainlandTransform = { x: 105, y: 35, scale: 0.88 };
    const insetTransforms = {
      AK: { x: -18, y: -267, scale: 0.65 },
      HI: { x: -405, y: -315, scale: 1.5 }
    };

    function mapTransform(abbr) {
      return insetTransforms[abbr] || mainlandTransform;
    }

    function displayPoint(point, abbr) {
      const transform = mapTransform(abbr);
      return [point[0] * transform.scale + transform.x, point[1] * transform.scale + transform.y];
    }

    function stateTransform(abbr) {
      const transform = mapTransform(abbr);
      return `translate(${transform.x} ${transform.y}) scale(${transform.scale})`;
    }

    function projectLower48(lat, lng) {
      const radians = Math.PI / 180;
      const phi1 = 29.5 * radians;
      const phi2 = 45.5 * radians;
      const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
      const c = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
      const rawRho0 = Math.sqrt(c) / n;
      const projectRaw = (latitude, longitude) => {
        const phi = latitude * radians;
        const lambda = longitude * radians;
        const rho = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
        return [rho * Math.sin(lambda * n), rawRho0 - rho * Math.cos(lambda * n)];
      };
      const point = projectRaw(lat, lng + 96);
      const center = projectRaw(38.7, -0.6);
      return [
        487.5 + 1300 * (point[0] - center[0]),
        305 - 1300 * (point[1] - center[1])
      ];
    }

    function routePoint(stop, centroids) {
      if (stop.abbr === "AK" || stop.abbr === "HI") return centroids[stop.abbr];
      return displayPoint(projectLower48(stop.lat, stop.lng), stop.abbr);
    }

    function interpolatePoints(start, end, progressValue) {
      const safeProgress = Math.max(0, Math.min(1, Number(progressValue) || 0));
      return [
        start[0] + (end[0] - start[0]) * safeProgress,
        start[1] + (end[1] - start[1]) * safeProgress
      ];
    }

    function stopByNumber(stopNumber) {
      return routeStops.find((stop) => stop.n === Number(stopNumber));
    }

    function pointByStopNumber(stopNumber, centroids) {
      const stop = stopByNumber(stopNumber);
      return stop ? routePoint(stop, centroids) : null;
    }

    function pointFromTracking(entity, centroids, fallbackPoint) {
      if (!entity) return fallbackPoint;
      const fromPoint = pointByStopNumber(entity.fromStop || entity.stop || entity.stopNumber, centroids);
      const toPoint = pointByStopNumber(entity.toStop, centroids);
      if (fromPoint && toPoint) return interpolatePoints(fromPoint, toPoint, entity.segmentProgress ?? entity.progress ?? 0);
      if (Number.isFinite(Number(entity.progress))) {
        const computed = interpolateRoute(Number(entity.progress));
        const start = pointByStopNumber(computed.segmentIndex + 1, centroids);
        const end = pointByStopNumber(Math.min(routeStops.length, computed.segmentIndex + 2), centroids);
        if (start && end) return interpolatePoints(start, end, Number(entity.progress) * (routeStops.length - 1) - computed.segmentIndex);
      }
      return fromPoint || fallbackPoint;
    }

    function pathPointsFromStops(stopNumbers, centroids) {
      return (stopNumbers || [])
        .map((stopNumber) => pointByStopNumber(stopNumber, centroids))
        .filter(Boolean);
    }

    function flightAirportPoint(code, centroids) {
      const airport = flightAirports[code];
      if (!airport) return null;
      if ((code === "HNL" || code === "ANC") && centroids[code === "HNL" ? "HI" : "AK"]) {
        const anchor = centroids[code === "HNL" ? "HI" : "AK"];
        const offset = airport.insetOffset || [0, 0];
        return [anchor[0] + offset[0], anchor[1] + offset[1]];
      }
      return displayPoint(projectLower48(airport.lat, airport.lng), "");
    }

    function appendStaticFlightLegs(layer, svgNS, centroids) {
      flightItinerary.forEach((flight) => {
        const start = flightAirportPoint(flight.from, centroids);
        const end = flightAirportPoint(flight.to, centroids);
        if (!start || !end) return;
        const midpoint = interpolatePoints(start, end, 0.5);
        const flightPath = document.createElementNS(svgNS, "path");
        flightPath.setAttribute("class", "map-route flight");
        flightPath.setAttribute("d", routePath([start, end]));
        flightPath.setAttribute("aria-hidden", "true");
        layer.appendChild(flightPath);
        if (flight.from === "HNL" && flight.to === "ANC") {
          const angle = Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI + 90;
          const plane = document.createElementNS(svgNS, "g");
          plane.setAttribute("class", "map-flight-plane");
          plane.setAttribute("transform", `translate(${midpoint[0]} ${midpoint[1]}) rotate(${angle.toFixed(2)})`);
          plane.setAttribute("aria-hidden", "true");
          const planeBody = document.createElementNS(svgNS, "path");
          planeBody.setAttribute("class", "map-flight-plane-body");
          planeBody.setAttribute("d", "M0 -21 Q3 -21 3 -18 L3 -4 L16 4 L16 8 L3 5 L3 18 L8 21 L8 23 L0 20 L-8 23 L-8 21 L-3 18 L-3 5 L-16 8 L-16 4 L-3 -4 L-3 -18 Q-3 -21 0 -21 Z");
          plane.appendChild(planeBody);
          layer.appendChild(plane);
        }
      });
    }

    function appendImageMarker(svg, svgNS, point, imageHref, className) {
      if (!point) return;
      const group = document.createElementNS(svgNS, "g");
      group.setAttribute("class", `map-entity-marker ${className}`);
      group.setAttribute("transform", `translate(${point[0]} ${point[1]})`);

      const image = document.createElementNS(svgNS, "image");
      image.setAttribute("class", "map-entity-image");
      image.setAttribute("href", imageHref);
      const imageFrame = className === "runner"
        ? { x: -14, y: -38, width: 28, height: 42 }
        : className === "rv"
          ? { x: -30, y: -20, width: 60, height: 40 }
          : { x: -20, y: -20, width: 40, height: 40 };
      image.setAttribute("x", String(imageFrame.x));
      image.setAttribute("y", String(imageFrame.y));
      image.setAttribute("width", String(imageFrame.width));
      image.setAttribute("height", String(imageFrame.height));
      image.setAttribute("preserveAspectRatio", className === "runner" || className === "rv" ? "xMidYMid meet" : "xMidYMid slice");

      group.append(image);
      svg.appendChild(group);
    }

    function updateTrackingMapKeyTerminology() {
      const runnerKey = document.querySelector(".tracking-map-key > span:first-child");
      if (!runnerKey) return;
      Array.from(runnerKey.childNodes).forEach((node) => {
        if (node.nodeType === 3 && node.textContent.trim() === "Runner") node.textContent = "Will";
      });
    }

    function activityRoutePoints(stop, centroids) {
      const coordinates = missionRaceMapModule?.decodeSummaryPolyline(stop.activity?.summaryPolyline);
      if (!coordinates || coordinates.length < 2) return [];
      const anchor = routePoint(stop, centroids);
      const projectedAnchor = displayPoint(projectLower48(stop.lat, stop.lng), stop.abbr);
      if (!anchor || !projectedAnchor) return [];
      return coordinates.map(([latitude, longitude]) => {
        const projected = displayPoint(projectLower48(latitude, longitude), stop.abbr);
        return [
          anchor[0] + projected[0] - projectedAnchor[0],
          anchor[1] + projected[1] - projectedAnchor[1]
        ];
      });
    }

    function renderMissionMap(topo, replace = false) {
      updateTrackingMapKeyTerminology();
      const mapEl = document.getElementById("mission-map");
      if (!mapEl || (mapEl.dataset.mapReady && !replace)) return;
      mapEl.dataset.mapReady = "true";
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      const [minX, minY, maxX, maxY] = topo.bbox;
      const initialViewBox = {
        x: minX - 116,
        y: minY - 18,
        width: maxX - minX + 160,
        height: maxY - minY + 56
      };
      let currentViewBox = { ...initialViewBox };
      let finishStopMarker = null;
      let finishEndpointLabel = null;
      const constrainViewBox = (box) => {
        const width = Math.min(initialViewBox.width, Math.max(initialViewBox.width * 0.42, box.width));
        const height = Math.min(initialViewBox.height, Math.max(initialViewBox.height * 0.42, box.height));
        const maxX = initialViewBox.x + initialViewBox.width - width;
        const maxY = initialViewBox.y + initialViewBox.height - height;
        return {
          x: width >= initialViewBox.width ? initialViewBox.x : Math.max(initialViewBox.x, Math.min(maxX, box.x)),
          y: height >= initialViewBox.height ? initialViewBox.y : Math.max(initialViewBox.y, Math.min(maxY, box.y)),
          width,
          height
        };
      };
      const updateFinishScale = () => {
        if (!finishStopMarker && !finishEndpointLabel) return;
        const zoomRatio = initialViewBox.width / currentViewBox.width;
        const finishScale = Math.max(0.38, Math.min(1, 1 / Math.pow(zoomRatio, 1.35)));
        if (finishStopMarker) {
          const cx = Number(finishStopMarker.getAttribute("cx"));
          const cy = Number(finishStopMarker.getAttribute("cy"));
          finishStopMarker.setAttribute("transform", `translate(${cx} ${cy}) scale(${finishScale}) translate(${-cx} ${-cy})`);
        }
        if (finishEndpointLabel) {
          const anchorX = Number(finishEndpointLabel.dataset.anchorX);
          const anchorY = Number(finishEndpointLabel.dataset.anchorY);
          finishEndpointLabel.setAttribute("transform", `translate(${anchorX} ${anchorY}) scale(${finishScale}) translate(${-anchorX} ${-anchorY})`);
        }
      };
      const setViewBox = (box) => {
        currentViewBox = constrainViewBox(box);
        svg.setAttribute("viewBox", `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
        updateFinishScale();
      };
      setViewBox(currentViewBox);
      svg.setAttribute("aria-hidden", "true");

      const { geometryToPath, bestCentroid } = decodeTopology(topo);
      const centroids = {};
      const stateLayer = document.createElementNS(svgNS, "g");
      topo.objects.states.geometries.forEach((geometry) => {
        const name = geometry.properties.name;
        const abbr = stateAbbr[name];
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", geometryToPath(geometry));
        path.setAttribute("class", "map-state");
        if (abbr) path.setAttribute("transform", stateTransform(abbr));
        path.dataset.state = abbr || "";
        const title = document.createElementNS(svgNS, "title");
        title.textContent = name;
        path.appendChild(title);
        stateLayer.appendChild(path);
        if (abbr) centroids[abbr] = displayPoint(bestCentroid(geometry), abbr);
      });
      svg.appendChild(stateLayer);

      const mapProgress = missionMapProgress();
      const { segmentIndex } = interpolateRoute(mapProgress);
      const currentIndex = Math.min(routeStops.length - 1, Math.floor(mapProgress * (routeStops.length - 1)));
      const routePoints = routeStops.map((stop) => routePoint(stop, centroids)).filter(Boolean);
      const liveStart = routePoints[segmentIndex];
      const liveEnd = routePoints[Math.min(routePoints.length - 1, segmentIndex + 1)];
      const liveSvgPoint = liveStart && liveEnd
        ? [
          liveStart[0] + (liveEnd[0] - liveStart[0]) * (mapProgress * (routeStops.length - 1) - segmentIndex),
          liveStart[1] + (liveEnd[1] - liveStart[1]) * (mapProgress * (routeStops.length - 1) - segmentIndex)
        ]
        : routePoints[currentIndex];
      const completedPoints = routePoints.slice(0, segmentIndex + 1).concat([liveSvgPoint]);
      const completedStops = routeStops.slice(0, segmentIndex + 1).concat([routeStops[Math.min(routeStops.length - 1, segmentIndex + 1)]]);
      const trackingData = {
        runner: { ...mapTrackingDefaults.runner, ...(window.missionMapTracking?.runner || window.missionRunnerTracking || {}) },
        flight: { ...mapTrackingDefaults.flight, ...(window.missionMapTracking?.flight || window.missionFlightTracking || {}) },
        rv: { ...mapTrackingDefaults.rv, ...(window.missionMapTracking?.rv || window.missionRvTracking || {}) }
      };

      const routeLayer = document.createElementNS(svgNS, "g");
      const futurePath = document.createElementNS(svgNS, "path");
      futurePath.setAttribute("class", "map-route future");
      futurePath.setAttribute("d", routePathWithoutFlightTransitions(routePoints, routeStops));
      routeLayer.appendChild(futurePath);
      const completePath = document.createElementNS(svgNS, "path");
      completePath.setAttribute("class", "map-route complete");
      completePath.setAttribute("d", routePathWithoutFlightTransitions(completedPoints, completedStops));
      routeLayer.appendChild(completePath);
      routeStops.forEach((stop) => {
        const activityPoints = activityRoutePoints(stop, centroids);
        if (activityPoints.length < 2) return;
        const activityPath = document.createElementNS(svgNS, "path");
        activityPath.setAttribute("class", "map-route complete map-activity-route");
        activityPath.setAttribute("d", routePath(activityPoints));
        activityPath.dataset.raceId = stop.raceId;
        routeLayer.appendChild(activityPath);
      });
      svg.appendChild(routeLayer);

      const travelLayer = document.createElementNS(svgNS, "g");

      const rvStopPath = pathPointsFromStops(trackingData.rv.pathStops, centroids);
      if (rvStopPath.length > 1) {
        const rvPath = document.createElementNS(svgNS, "path");
        rvPath.setAttribute("class", "map-route rv");
        rvPath.setAttribute("d", routePath(rvStopPath));
        travelLayer.appendChild(rvPath);
      }
      svg.appendChild(travelLayer);

      const flightLayer = document.createElementNS(svgNS, "g");
      flightLayer.setAttribute("class", "map-flight-layer");
      appendStaticFlightLegs(flightLayer, svgNS, centroids);
      svg.insertBefore(flightLayer, routeLayer);

      const stopCard = document.createElementNS(svgNS, "g");
      stopCard.setAttribute("class", "map-stop-card");
      stopCard.setAttribute("aria-hidden", "true");
      const stopCardRect = document.createElementNS(svgNS, "rect");
      stopCardRect.setAttribute("x", "0");
      stopCardRect.setAttribute("y", "0");
      stopCardRect.setAttribute("width", "240");
      stopCardRect.setAttribute("height", "92");
      stopCardRect.setAttribute("rx", "0");
      const stopCardKicker = document.createElementNS(svgNS, "text");
      stopCardKicker.setAttribute("class", "map-card-kicker");
      stopCardKicker.setAttribute("x", "18");
      stopCardKicker.setAttribute("y", "26");
      const stopCardCity = document.createElementNS(svgNS, "text");
      stopCardCity.setAttribute("class", "map-card-city");
      stopCardCity.setAttribute("x", "18");
      stopCardCity.setAttribute("y", "56");
      const stopCardDate = document.createElementNS(svgNS, "text");
      stopCardDate.setAttribute("class", "map-card-date");
      stopCardDate.setAttribute("x", "18");
      stopCardDate.setAttribute("y", "78");
      const stopCardTransport = document.createElementNS(svgNS, "g");
      stopCardTransport.setAttribute("class", "map-card-transport");
      stopCardTransport.setAttribute("transform", "translate(216 46)");
      const stopCardTransportRv = document.createElementNS(svgNS, "image");
      stopCardTransportRv.setAttribute("class", "map-card-transport-rv");
      stopCardTransportRv.setAttribute("href", mapEntityAssets.rv);
      stopCardTransportRv.setAttribute("x", "-18");
      stopCardTransportRv.setAttribute("y", "-21");
      stopCardTransportRv.setAttribute("width", "36");
      stopCardTransportRv.setAttribute("height", "30");
      stopCardTransportRv.setAttribute("preserveAspectRatio", "xMidYMid meet");
      const stopCardTransportFlight = document.createElementNS(svgNS, "path");
      stopCardTransportFlight.setAttribute("class", "map-card-transport-flight");
      stopCardTransportFlight.setAttribute("d", "M0 -21 Q3 -21 3 -18 L3 -4 L16 4 L16 8 L3 5 L3 18 L8 21 L8 23 L0 20 L-8 23 L-8 21 L-3 18 L-3 5 L-16 8 L-16 4 L-3 -4 L-3 -18 Q-3 -21 0 -21 Z");
      stopCardTransportFlight.setAttribute("transform", "scale(0.62)");
      const stopCardTransportLabel = document.createElementNS(svgNS, "text");
      stopCardTransportLabel.setAttribute("class", "map-card-transport-label");
      stopCardTransportLabel.setAttribute("x", "0");
      stopCardTransportLabel.setAttribute("y", "32");
      stopCardTransportLabel.setAttribute("text-anchor", "middle");
      stopCardTransport.append(stopCardTransportRv, stopCardTransportFlight, stopCardTransportLabel);
      stopCard.append(stopCardRect, stopCardKicker, stopCardCity, stopCardDate, stopCardTransport);

      const showStopCard = (stop, point) => {
        const viewBox = svg.viewBox.baseVal;
        const cardWidth = 240;
        const cardHeight = 92;
        const offsetX = point[0] > viewBox.x + viewBox.width - cardWidth - 36 ? -cardWidth - 22 : 22;
        const offsetY = point[1] > viewBox.y + viewBox.height - cardHeight - 28 ? -cardHeight - 18 : 18;
        stopCard.setAttribute("transform", `translate(${point[0] + offsetX} ${point[1] + offsetY})`);
        stopCardKicker.textContent = `Stop ${String(stop.n).padStart(2, "0")}`;
        stopCardCity.textContent = stop.city.length > 13 ? `${stop.city.slice(0, 12)}.` : stop.city;
        stopCardDate.textContent = stop.date;
        const outboundMode = stopOutboundMode(stop);
        stopCardTransport.classList.toggle("is-flight", outboundMode === "flight");
        stopCardTransport.classList.toggle("is-rv", outboundMode !== "flight");
        stopCardTransportLabel.textContent = outboundMode === "flight" ? "Flight" : "RV";
        stopCard.classList.add("is-visible");
      };

      const resetStopCard = () => {
        stopCard.classList.remove("is-visible");
        svg.querySelectorAll(".map-state").forEach((item) => item.classList.remove("is-active"));
        svg.querySelectorAll(".map-stop").forEach((item, index) => item.classList.toggle("is-current", index === currentIndex));
      };

      routeStops.forEach((stop, index) => {
        const point = routePoint(stop, centroids);
        if (!point) return;
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", point[0]);
        circle.setAttribute("cy", point[1]);
        circle.setAttribute("r", stop.n === 1 || stop.n === 50 ? "6" : "4.8");
        circle.setAttribute("class", `map-stop${index === currentIndex ? " is-current" : ""}${stop.status === "completed" ? " is-completed" : ""}${stop.n === 1 || stop.n === 50 ? " is-terminal" : ""}`);
        circle.setAttribute("tabindex", "0");
        circle.setAttribute("role", "button");
        const statusLabel = stop.status === "completed" ? ", completed" : "";
        circle.setAttribute("aria-label", `${stop.n}. ${stop.city}, ${stop.state}, ${stop.date}${statusLabel}`);
        const title = document.createElementNS(svgNS, "title");
        title.textContent = `${stop.n}. ${stop.city}, ${stop.state} | ${stop.date}${statusLabel}`;
        circle.appendChild(title);
        const selectStop = () => {
          svg.querySelectorAll(".map-stop").forEach((item) => item.classList.remove("is-current"));
          svg.querySelectorAll(".map-state").forEach((item) => item.classList.toggle("is-active", item.dataset.state === stop.abbr));
          circle.classList.add("is-current");
          showStopCard(stop, point);
          trackAnalyticsEvent("map_city_open", getRunAnalyticsPayload(stop));
        };
        circle.addEventListener("click", (event) => {
          event.stopPropagation();
          selectStop();
        });
        circle.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectStop();
          }
        });
        if (stop.n === 50) finishStopMarker = circle;
        svg.appendChild(circle);
      });

      [
        ["START", routePoints[0], 18, -12],
        ["FINISH", routePoints[routePoints.length - 1], 16, -12]
      ].forEach(([label, point, offsetX, offsetY]) => {
        if (!point) return;
        const text = document.createElementNS(svgNS, "text");
        const anchorX = point[0] + offsetX;
        const anchorY = point[1] + offsetY;
        text.setAttribute("class", `map-endpoint-label is-${label.toLowerCase()}`);
        text.setAttribute("x", anchorX);
        text.setAttribute("y", anchorY);
        text.dataset.anchorX = String(anchorX);
        text.dataset.anchorY = String(anchorY);
        text.textContent = label;
        if (label === "FINISH") finishEndpointLabel = text;
        svg.appendChild(text);
      });
      updateFinishScale();

      if (liveSvgPoint) {
        const pulse = document.createElementNS(svgNS, "circle");
        pulse.setAttribute("class", "map-live-pulse");
        pulse.setAttribute("cx", liveSvgPoint[0]);
        pulse.setAttribute("cy", liveSvgPoint[1]);
        pulse.setAttribute("r", "8");
        svg.appendChild(pulse);
        const live = document.createElementNS(svgNS, "circle");
        live.setAttribute("class", "map-live-marker");
        live.setAttribute("cx", liveSvgPoint[0]);
        live.setAttribute("cy", liveSvgPoint[1]);
        live.setAttribute("r", "9");
        svg.appendChild(live);
      }

      const runnerPoint = pointFromTracking(trackingData.runner, centroids, liveSvgPoint);
      const rvPoint = pointFromTracking(
        {
          fromStop: trackingData.rv.fromStop || trackingData.rv.pathStops?.[0],
          toStop: trackingData.rv.toStop || trackingData.rv.pathStops?.[trackingData.rv.pathStops.length - 1],
          progress: trackingData.rv.progress
        },
        centroids,
        rvStopPath[rvStopPath.length - 1] || routePoints[Math.min(routePoints.length - 1, currentIndex + 2)]
      );
      const displayedRvPoint = missionHapnLivePosition
        ? displayPoint(projectLower48(missionHapnLivePosition.lat, missionHapnLivePosition.lng), "")
        : rvPoint;
      appendImageMarker(svg, svgNS, displayedRvPoint, mapEntityAssets.rv, "rv");
      appendImageMarker(svg, svgNS, runnerPoint, mapEntityAssets.runner, "runner");

      svg.appendChild(stopCard);
      const zoomBy = (factor) => {
        const nextWidth = currentViewBox.width * factor;
        const nextHeight = currentViewBox.height * factor;
        const centerX = currentViewBox.x + currentViewBox.width / 2;
        const centerY = currentViewBox.y + currentViewBox.height / 2;
        setViewBox({
          x: centerX - nextWidth / 2,
          y: centerY - nextHeight / 2,
          width: nextWidth,
          height: nextHeight
        });
      };
      const zoomControls = document.createElement("div");
      zoomControls.className = "map-zoom-controls";
      zoomControls.setAttribute("aria-label", "Map zoom controls");
      const zoomIn = document.createElement("button");
      zoomIn.type = "button";
      zoomIn.className = "map-zoom-button";
      zoomIn.setAttribute("aria-label", "Zoom in");
      zoomIn.textContent = "+";
      zoomIn.addEventListener("click", () => {
        zoomBy(0.82);
        trackAnalyticsEvent("map_zoom", { action: "zoom_in" });
      });
      const zoomOut = document.createElement("button");
      zoomOut.type = "button";
      zoomOut.className = "map-zoom-button";
      zoomOut.setAttribute("aria-label", "Zoom out");
      zoomOut.textContent = "\u2212";
      zoomOut.addEventListener("click", () => {
        zoomBy(1.22);
        trackAnalyticsEvent("map_zoom", { action: "zoom_out" });
      });
      const zoomReset = document.createElement("button");
      zoomReset.type = "button";
      zoomReset.className = "map-zoom-button map-zoom-reset";
      zoomReset.setAttribute("aria-label", "Reset map view");
      zoomReset.textContent = "\u21ba";
      zoomReset.addEventListener("click", () => {
        setViewBox({ ...initialViewBox });
        trackAnalyticsEvent("map_zoom", { action: "reset" });
      });
      zoomControls.append(zoomIn, zoomOut, zoomReset);

      let pinchStart = null;
      const touchDistance = (touches) => Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      const panBlockedSelector = ".map-stop, .map-stop-card, .map-entity-marker";
      let panStart = null;
      let suppressNextMapClick = false;
      svg.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.pointerType === "touch" || event.target.closest(panBlockedSelector)) return;
        panStart = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          viewBox: { ...currentViewBox },
          moved: false
        };
        svg.classList.add("is-panning");
        svg.setPointerCapture?.(event.pointerId);
      });
      svg.addEventListener("pointermove", (event) => {
        if (!panStart || panStart.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - panStart.clientX;
        const deltaY = event.clientY - panStart.clientY;
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) panStart.moved = true;
        const svgRect = svg.getBoundingClientRect();
        setViewBox({
          x: panStart.viewBox.x - (deltaX / Math.max(1, svgRect.width)) * panStart.viewBox.width,
          y: panStart.viewBox.y - (deltaY / Math.max(1, svgRect.height)) * panStart.viewBox.height,
          width: panStart.viewBox.width,
          height: panStart.viewBox.height
        });
      });
      const endPointerPan = (event) => {
        if (!panStart || panStart.pointerId !== event.pointerId) return;
        suppressNextMapClick = panStart.moved;
        panStart = null;
        svg.classList.remove("is-panning");
        svg.releasePointerCapture?.(event.pointerId);
      };
      svg.addEventListener("pointerup", endPointerPan);
      svg.addEventListener("pointercancel", endPointerPan);
      svg.addEventListener("touchstart", (event) => {
        if (event.touches.length === 1 && !event.target.closest(panBlockedSelector)) {
          pinchStart = {
            type: "pan",
            clientX: event.touches[0].clientX,
            clientY: event.touches[0].clientY,
            viewBox: { ...currentViewBox }
          };
          return;
        }
        if (event.touches.length === 2) {
          pinchStart = {
            type: "pinch",
            distance: touchDistance(event.touches),
            viewBox: { ...currentViewBox }
          };
        }
      }, { passive: true });
      svg.addEventListener("touchmove", (event) => {
        if (!pinchStart) return;
        event.preventDefault();
        if (pinchStart.type === "pan" && event.touches.length === 1) {
          const deltaX = event.touches[0].clientX - pinchStart.clientX;
          const deltaY = event.touches[0].clientY - pinchStart.clientY;
          const svgRect = svg.getBoundingClientRect();
          setViewBox({
            x: pinchStart.viewBox.x - (deltaX / Math.max(1, svgRect.width)) * pinchStart.viewBox.width,
            y: pinchStart.viewBox.y - (deltaY / Math.max(1, svgRect.height)) * pinchStart.viewBox.height,
            width: pinchStart.viewBox.width,
            height: pinchStart.viewBox.height
          });
          return;
        }
        if (pinchStart.type === "pinch" && event.touches.length === 2) {
          const factor = pinchStart.distance / Math.max(1, touchDistance(event.touches));
          const nextWidth = pinchStart.viewBox.width * factor;
          const nextHeight = pinchStart.viewBox.height * factor;
          const centerX = pinchStart.viewBox.x + pinchStart.viewBox.width / 2;
          const centerY = pinchStart.viewBox.y + pinchStart.viewBox.height / 2;
          setViewBox({
            x: centerX - nextWidth / 2,
            y: centerY - nextHeight / 2,
            width: nextWidth,
            height: nextHeight
          });
        }
      }, { passive: false });
      svg.addEventListener("touchend", (event) => {
        if (event.touches.length === 0) pinchStart = null;
      }, { passive: true });

      mapEl.replaceChildren(svg, zoomControls);
      svg.addEventListener("click", (event) => {
        if (suppressNextMapClick) {
          suppressNextMapClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!event.target.closest(".map-stop")) resetStopCard();
      });

      mapEl.resetStopCard = resetStopCard;
      if (!mapEl.dataset.outsideResetBound) {
        mapEl.dataset.outsideResetBound = "true";
        document.addEventListener("pointerdown", (event) => {
          if (!mapEl.contains(event.target)) mapEl.resetStopCard?.();
        });
      }
    }

    function raceMapSignature(stops, status) {
      return JSON.stringify({
        active: status.active,
        completedRaces: status.completedRaces,
        races: stops.map((stop) => [
          stop.raceId || `ggma-2026-${String(stop.n).padStart(2, "0")}`,
          stop.n, stop.state, stop.city, stop.date, stop.status || "scheduled",
          stop.activity?.stravaActivityId || null, stop.activity?.summaryPolyline || null
        ])
      });
    }

    function updateRaceMapAccessibility() {
      const completed = Number(missionRaceStatus.completedRaces) || 0;
      const total = Number(missionRaceStatus.totalRaces) || 50;
      const map = document.getElementById("mission-map");
      if (map) map.setAttribute("aria-label", `Interactive Goodwin Generated Mission America route map. ${completed} of ${total} races completed.`);
    }

    function clearMissionHapnPosition() {
      if (!missionHapnLivePosition) return;
      missionHapnLivePosition = null;
      if (missionMapTopology) renderMissionMap(missionMapTopology, true);
    }

    function disableMissionHapn() {
      missionHapnRaceStatus = null;
      missionHapnPoller?.stop();
      clearMissionHapnPosition();
    }

    function coordinateMissionHapn(snapshot) {
      missionHapnRaceStatus = snapshot?.source === "api"
        ? { ...snapshot.status, source: "api" }
        : null;
      if (!missionRaceMapModule?.hapnLivePositioningEnabled(missionHapnRaceStatus)) {
        missionHapnPoller?.stop();
        clearMissionHapnPosition();
        return;
      }
      void missionHapnPoller?.start();
    }

    function applyPublicRaceSnapshot(snapshot) {
      if (snapshot?.source !== "api") return;
      const previousSignature = raceMapSignature(routeStops, missionRaceStatus);
      routeStops = snapshot.races;
      missionRaceStatus = { ...snapshot.status, source: "api" };
      coordinateMissionHapn(snapshot);
      const changed = raceMapSignature(routeStops, missionRaceStatus) !== previousSignature;
      if (changed) renderRunItinerary();
      updateRaceMapAccessibility();
      if (missionMapTopology && changed) renderMissionMap(missionMapTopology, true);
    }

    async function loadMissionMapTopology() {
      const sources = ["assets/us-states-albers-10m.json", "../assets/us-states-albers-10m.json"];
      for (const source of sources) {
        try {
          const response = await fetch(source, { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error(`Map returned ${response.status}`);
          return response.json();
        } catch (error) {
          console.warn(error);
        }
      }
      return window.missionAmericaMapTopology || null;
    }

    async function loadMissionMap() {
      if (missionMapLoadPromise) return missionMapLoadPromise;
      missionMapLoadPromise = (async () => {
        const trackingPromise = loadMissionTrackingStatus();
        missionMapTopology = await loadMissionMapTopology();
        await trackingPromise;
        if (missionMapTopology) {
          renderMissionMap(missionMapTopology);
        } else {
          document.getElementById("mission-map").textContent = "Map data could not load. Serve this page from the preview server to view the interactive U.S. route map.";
          return;
        }

        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        const snapshot = await import("/assets/strava-race-map.mjs")
          .then(async (raceMapModule) => {
            missionRaceMapModule = raceMapModule;
            missionHapnPoller?.destroy();
            missionHapnPoller = raceMapModule.createPublicRvPoller({
              load: raceMapModule.loadPublicRvLocation,
              isEnabled: () => raceMapModule.hapnLivePositioningEnabled(missionHapnRaceStatus),
              onPosition: (position) => {
                missionHapnLivePosition = { ...position };
                if (missionMapTopology) renderMissionMap(missionMapTopology, true);
              },
              onFallback: clearMissionHapnPosition
            });
            return raceMapModule.loadPublicRaceSnapshot({ staticStops: staticRouteStops });
          })
          .catch(() => {
            console.warn("Public race data unavailable; using the static schedule.");
            return null;
          });
        applyPublicRaceSnapshot(snapshot);
        if (snapshot?.source === "api" && snapshot.status.active && missionRaceMapModule) {
          missionRacePoller?.stop();
          missionRacePoller = missionRaceMapModule.createPublicRacePoller({
            load: () => missionRaceMapModule.loadPublicRaceSnapshot({ staticStops: staticRouteStops }),
            onSnapshot: applyPublicRaceSnapshot,
            onFailure: disableMissionHapn
          });
          await missionRacePoller.start(snapshot);
        }
      })();
      return missionMapLoadPromise;
    }

    function initMissionMapLoading() {
      const mapEl = document.getElementById("mission-map");
      if (!mapEl) return;

      const start = () => {
        if (mapEl.dataset.mapLoadStarted === "true") return;
        mapEl.dataset.mapLoadStarted = "true";
        loadMissionMap();
      };

      if (!("IntersectionObserver" in window)) {
        window.addEventListener("load", start, { once: true });
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        start();
      }, { rootMargin: "700px 0px" });

      observer.observe(mapEl);
    }

    initMissionMapLoading();

    document.querySelector("[data-follow-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = document.querySelector("[data-follow-message]");
      const data = new FormData(form);
      const email = String(data.get("email") || "").trim();
      if (!email) return;
      const subscribers = JSON.parse(localStorage.getItem("mission-follow-emails") || "[]");
      subscribers.push({ email, createdAt: new Date().toISOString() });
      localStorage.setItem("mission-follow-emails", JSON.stringify(subscribers));
      if (message) message.textContent = "Thanks. You are on the Goodwin Generated Mission America updates list.";
      form.reset();
    });

    document.querySelectorAll("[data-update-id]").forEach((update) => {
      const id = update.dataset.updateId;
      const form = update.querySelector("[data-comment-form]");
      const list = update.querySelector("[data-comment-list]");
      const key = `mission-comments-${id}`;
      const render = () => {
        const comments = JSON.parse(localStorage.getItem(key) || "[]");
        list.innerHTML = comments.map((comment) => `<div><strong>${comment.name}</strong>: ${comment.text}</div>`).join("");
      };
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const name = String(data.get("name") || "Guest").trim();
        const text = String(data.get("comment") || "").trim();
        if (!text) return;
        const comments = JSON.parse(localStorage.getItem(key) || "[]");
        comments.push({
          name: name.replace(/[<>]/g, ""),
          text: text.replace(/[<>]/g, "")
        });
        localStorage.setItem(key, JSON.stringify(comments));
        form.reset();
        render();
      });
      render();
    });
