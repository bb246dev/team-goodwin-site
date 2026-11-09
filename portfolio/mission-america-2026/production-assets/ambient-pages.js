(() => {
  if (document.body?.dataset.ambientPages === "disabled") return;

  const BLACK = { base: [6, 14, 15], glowOne: [18, 38, 34], glowTwo: [24, 34, 47] };
  const WHITE = { base: [240, 241, 235], glowOne: [255, 251, 239], glowTwo: [207, 225, 218] };
  const GREEN = { base: [25, 59, 59], glowOne: [52, 96, 82], glowTwo: [45, 66, 78] };
  const palettes = [BLACK, WHITE, GREEN, WHITE, BLACK, BLACK];
  const anchorSelectors = [
    ".hero",
    ".profile",
    ".faq-hero",
    ".updates-hero",
    ".legal-hero",
    ".record",
    ".grid",
    ".body",
    ".itinerary-section",
    ".states",
    ".schedule",
    ".faq-list",
    ".updates-archive",
    ".legal-copy",
    ".site-footer",
    ".global-site-footer",
  ];
  const LIGHT_INK = [248, 247, 239];
  const DARK_INK = [9, 31, 29];
  const MIN_TRANSITION_DISTANCE = 960;
  const TRANSITION_VIEWPORT_FACTOR = 1.5;

  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  const mix = (start, end, amount) => start.map((channel, index) => channel + (end[index] - channel) * amount);
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const rgb = (value) => value.map(Math.round).join(" ");
  const relativeLuminance = (color) => {
    const channels = color.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const background = document.createElement("div");
  background.className = "ambient-pages-background";
  background.setAttribute("aria-hidden", "true");
  document.body.prepend(background);
  document.body.classList.add("has-ambient-pages");

  const trackerNav = document.querySelector(".tracker-nav");
  const trackerMenuToggle = document.querySelector(".tracker-menu-toggle");
  if (trackerNav && trackerMenuToggle) {
    trackerMenuToggle.addEventListener("click", () => {
      const isOpen = trackerNav.classList.toggle("is-open");
      trackerMenuToggle.setAttribute("aria-expanded", String(isOpen));
      trackerMenuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
    });
    trackerNav.querySelectorAll(".tracker-navlinks a").forEach((link) => {
      link.addEventListener("click", () => {
        trackerNav.classList.remove("is-open");
        trackerMenuToggle.setAttribute("aria-expanded", "false");
        trackerMenuToggle.setAttribute("aria-label", "Open navigation menu");
      });
    });
  }

  if (trackerNav) {
    const desktopQuery = window.matchMedia("(min-width: 769px)");
    const updateNavFade = () => {
      trackerNav.classList.toggle("is-scrolled", desktopQuery.matches && window.scrollY > 180);
    };

    updateNavFade();
    window.addEventListener("scroll", updateNavFade, { passive: true });
    desktopQuery.addEventListener?.("change", updateNavFade);
  }

  let anchors = [];
  let frame = 0;
  let targetScroll = window.scrollY;
  let renderedScroll = targetScroll;
  let scrollVelocity = 0;
  let previousTime = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const measure = () => {
    anchors = anchorSelectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .map((element) => Math.round(element.getBoundingClientRect().top + window.scrollY))
      .sort((a, b) => a - b)
      .filter((position, index, positions) => index === 0 || Math.abs(position - positions[index - 1]) > 16);

    if (!anchors.length) anchors = [0, document.documentElement.scrollHeight];
  };

  const paletteAt = (scrollPosition) => {
    const focus = scrollPosition;
    const transitionDistance = Math.max(MIN_TRANSITION_DISTANCE, window.innerHeight * TRANSITION_VIEWPORT_FACTOR);
    const halfTransition = transitionDistance / 2;
    let current = palettes[0];

    for (let index = 1; index < anchors.length && index < palettes.length; index += 1) {
      const boundary = anchors[index];
      const amount = smoothstep(clamp((focus - boundary + halfTransition) / transitionDistance));
      current = {
        base: mix(current.base, palettes[index].base, amount),
        glowOne: mix(current.glowOne, palettes[index].glowOne, amount),
        glowTwo: mix(current.glowTwo, palettes[index].glowTwo, amount),
      };
    }

    return {
      base: current.base,
      glowOne: current.glowOne,
      glowTwo: current.glowTwo,
    };
  };

  const render = () => {
    frame = 0;
    if (anchors.length < 2) measure();
    targetScroll = window.scrollY;
    const now = performance.now();
    const deltaTime = previousTime ? Math.min(0.032, (now - previousTime) / 1000) : 1 / 60;
    previousTime = now;

    if (reducedMotion.matches) {
      renderedScroll = targetScroll;
      scrollVelocity = 0;
    } else {
      const displacement = targetScroll - renderedScroll;
      scrollVelocity += displacement * 9 * deltaTime;
      scrollVelocity *= Math.exp(-3.8 * deltaTime);
      renderedScroll += scrollVelocity * deltaTime;
      if (Math.abs(displacement) < 0.1 && Math.abs(scrollVelocity) < 0.1) {
        renderedScroll = targetScroll;
        scrollVelocity = 0;
      }
    }

    const palette = paletteAt(renderedScroll);
    const baseLuminance = relativeLuminance(palette.base);
    const inkAmount = smoothstep(clamp((0.52 - baseLuminance) / 0.48));
    const readableAmount = smoothstep(clamp((baseLuminance - 0.5) / 0.18));
    const readableInk = mix(LIGHT_INK, DARK_INK, readableAmount);
    const readableMutedInk = mix([210, 221, 214], [53, 73, 69], readableAmount);
    const panelFill = mix([13, 31, 31], [255, 255, 255], readableAmount);
    const phase = renderedScroll / Math.max(720, window.innerHeight * 1.08);
    document.documentElement.style.setProperty("--ambient-base", rgb(palette.base));
    document.documentElement.style.setProperty("--ambient-glow-one", rgb(palette.glowOne));
    document.documentElement.style.setProperty("--ambient-glow-two", rgb(palette.glowTwo));
    document.documentElement.style.setProperty("--ambient-ink", rgb(mix(DARK_INK, LIGHT_INK, inkAmount)));
    document.documentElement.style.setProperty("--ambient-readable-ink", rgb(readableInk));
    document.documentElement.style.setProperty("--ambient-readable-muted", rgb(readableMutedInk));
    document.documentElement.style.setProperty("--ambient-panel-fill", rgb(panelFill));
    document.documentElement.dataset.ambientTheme = readableAmount > 0.5 ? "light" : "dark";
    document.documentElement.style.setProperty("--ambient-page-drift-x", `${Math.sin(phase * 0.62) * window.innerWidth * 0.045}px`);
    document.documentElement.style.setProperty("--ambient-page-drift-y", `${Math.cos(phase * 0.5) * 30}px`);
    document.documentElement.style.setProperty("--ambient-page-scale", `${1.06 + Math.sin(phase * 0.35) * 0.03}`);

    if (!reducedMotion.matches && (Math.abs(targetScroll - renderedScroll) >= 0.1 || Math.abs(scrollVelocity) >= 0.1)) {
      frame = requestAnimationFrame(render);
    }
  };

  const requestRender = () => {
    targetScroll = window.scrollY;
    if (!frame) frame = requestAnimationFrame(render);
  };
  measure();
  render();
  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", () => { measure(); requestRender(); });
  window.addEventListener("load", () => { measure(); requestRender(); }, { once: true });
  reducedMotion.addEventListener("change", requestRender);
})();
