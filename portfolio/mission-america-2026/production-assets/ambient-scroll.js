(() => {
  const BLACK = { base: [6, 14, 15], glowOne: [18, 38, 34], glowTwo: [24, 34, 47] };
  const WHITE = { base: [240, 241, 235], glowOne: [255, 251, 239], glowTwo: [207, 225, 218] };
  const GREEN = { base: [25, 59, 59], glowOne: [52, 96, 82], glowTwo: [45, 66, 78] };
  const palettes = [BLACK, WHITE, GREEN, WHITE, BLACK, BLACK, BLACK];
  const anchorSelectors = ["#the-run", "#map", "#updates", "#articles", "#why", "#rsvp", ".site-footer"];
  const LIGHT_INK = [248, 247, 239];
  const DARK_INK = [9, 31, 29];
  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const mix = (start, end, amount) => start.map((channel, index) => channel + (end[index] - channel) * amount);
  const rgb = (value) => value.map(Math.round).join(" ");
  const relativeLuminance = (color) => {
    const channels = color.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };

  const background = document.createElement("div");
  background.className = "ambient-scroll-background";
  background.setAttribute("aria-hidden", "true");
  ["one", "two", "three"].forEach((name) => {
    const cloud = document.createElement("span");
    cloud.className = `ambient-scroll-cloud ambient-scroll-cloud-${name}`;
    background.append(cloud);
  });
  const progress = document.createElement("div");
  progress.className = "ambient-scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  progress.append(document.createElement("span"));
  document.body.prepend(background, progress);
  document.body.classList.add("has-ambient-scroll");

  const clouds = [...background.querySelectorAll(".ambient-scroll-cloud")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let anchors = [];
  let frame = 0;
  let targetScroll = window.scrollY;
  let renderedScroll = targetScroll;
  let scrollVelocity = 0;
  let previousTime = 0;

  const measure = () => {
    anchors = anchorSelectors
      .map((selector) => document.querySelector(selector))
      .filter(Boolean)
      .map((element) => element.getBoundingClientRect().top + window.scrollY);
  };

  const paletteAt = (scrollPosition) => {
    const focus = scrollPosition + window.innerHeight * 0.5;
    let index = 0;
    while (index < anchors.length - 1 && focus >= anchors[index + 1]) index += 1;
    const end = anchors[index + 1] ?? document.documentElement.scrollHeight;
    const start = anchors[index] ?? 0;
    const interval = Math.max(1, end - start);
    // Use the entire distance between section anchors. The old final-30% window
    // compressed the change and made otherwise continuous colors feel abrupt.
    const amount = smoothstep(clamp((focus - start) / interval));
    const current = palettes[Math.min(index, palettes.length - 1)];
    const next = palettes[Math.min(index + 1, palettes.length - 1)];
    return {
      base: mix(current.base, next.base, amount),
      glowOne: mix(current.glowOne, next.glowOne, amount),
      glowTwo: mix(current.glowTwo, next.glowTwo, amount),
    };
  };

  const updateClouds = (palette) => {
    const lag = clamp(targetScroll - renderedScroll, -360, 360);
    const phase = renderedScroll / Math.max(720, window.innerHeight * 1.08);
    const velocityLean = clamp(scrollVelocity * 0.016, -26, 26);
    const transforms = [
      `translate3d(${Math.sin(phase * 0.86) * window.innerWidth * 0.052}px, ${Math.cos(phase * 0.56) * 34 - lag * 0.3}px, 0) rotate(${Math.sin(phase * 0.46) * 3 + velocityLean * 0.1}deg) scale(${1.08 + Math.sin(phase * 0.38) * 0.04})`,
      `translate3d(${Math.cos(phase * 0.7) * window.innerWidth * -0.058}px, ${Math.sin(phase * 0.72) * 42 - lag * 0.2}px, 0) rotate(${Math.cos(phase * 0.4) * -4 - velocityLean * 0.08}deg) scale(${1.1 + Math.cos(phase * 0.33) * 0.045})`,
      `translate3d(${Math.sin(phase * 0.52 + 1.4) * window.innerWidth * 0.042}px, ${Math.cos(phase * 0.48 + 0.8) * 30 + lag * 0.12}px, 0) rotate(${Math.sin(phase * 0.35 + 0.6) * 2.4}deg) scale(${1.06 + Math.sin(phase * 0.3) * 0.03})`,
    ];
    clouds.forEach((cloud, index) => { cloud.style.transform = transforms[index]; });
    document.documentElement.style.setProperty("--ambient-base", rgb(palette.base));
    document.documentElement.style.setProperty("--ambient-glow-one", rgb(palette.glowOne));
    document.documentElement.style.setProperty("--ambient-glow-two", rgb(palette.glowTwo));
    const baseLuminance = relativeLuminance(palette.base);
    const ambientInkAmount = smoothstep(clamp((0.52 - baseLuminance) / 0.48));
    const insideInkAmount = smoothstep(clamp((0.13 - baseLuminance) / 0.08));
    document.documentElement.style.setProperty("--inside-ambient-ink", rgb(mix(DARK_INK, LIGHT_INK, insideInkAmount)));
    document.documentElement.style.setProperty("--ambient-ink", rgb(mix(DARK_INK, LIGHT_INK, ambientInkAmount)));
    document.documentElement.dataset.ambientTheme = baseLuminance > 0.179 ? "light" : "dark";
    document.documentElement.style.setProperty("--ambient-cloud-lag", Math.abs(lag).toFixed(2));
    document.documentElement.style.setProperty("--ambient-rendered-scroll", renderedScroll.toFixed(2));
  };

  const render = (time = performance.now()) => {
    frame = 0;
    if (anchors.length < 2) measure();
    targetScroll = window.scrollY;
    const deltaTime = previousTime ? Math.min(0.032, (time - previousTime) / 1000) : 1 / 60;
    previousTime = time;
    if (reducedMotion.matches) {
      renderedScroll = targetScroll;
      scrollVelocity = 0;
    } else {
      const displacement = targetScroll - renderedScroll;
      scrollVelocity += displacement * 15 * deltaTime;
      scrollVelocity *= Math.exp(-4.8 * deltaTime);
      renderedScroll += scrollVelocity * deltaTime;
      if (Math.abs(displacement) < 0.1 && Math.abs(scrollVelocity) < 0.1) {
        renderedScroll = targetScroll;
        scrollVelocity = 0;
      }
    }

    updateClouds(paletteAt(renderedScroll));
    document.documentElement.dataset.ambientMotion = renderedScroll === targetScroll ? "settled" : "moving";
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    progress.firstElementChild.style.transform = `scaleX(${maxScroll > 0 ? window.scrollY / maxScroll : 0})`;
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
