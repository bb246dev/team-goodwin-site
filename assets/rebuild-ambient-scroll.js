(() => {
  const DARK = { base: [6, 14, 15], glowOne: [18, 38, 34], glowTwo: [24, 34, 47] };
  const GREEN = { base: [20, 63, 60], glowOne: [52, 96, 82], glowTwo: [45, 66, 78] };
  const LIGHT = { base: [240, 241, 235], glowOne: [255, 251, 239], glowTwo: [207, 225, 218] };
  const anchorsConfig = [
    ["#home", DARK],
    ["#record", GREEN],
    ["#story", GREEN],
    [".people-section", LIGHT],
    ["#goodwin", GREEN],
    ["#legacy", DARK],
    [".site-footer", DARK],
  ];
  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const mix = (start, end, amount) => start.map((channel, index) => channel + (end[index] - channel) * amount);
  const rgb = (value) => value.map(Math.round).join(" ");

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
    anchors = anchorsConfig.map(([selector, palette]) => {
      const element = document.querySelector(selector);
      return element ? { top: element.getBoundingClientRect().top + window.scrollY, palette } : null;
    }).filter(Boolean);
  };

  const paletteAt = (scrollPosition) => {
    const focus = scrollPosition + window.innerHeight * .5;
    let index = 0;
    while (index < anchors.length - 1 && focus >= anchors[index + 1].top) index += 1;
    const current = anchors[index] || { top: 0, palette: DARK };
    const next = anchors[index + 1] || { top: document.documentElement.scrollHeight, palette: current.palette };
    const amount = smoothstep(clamp((focus - current.top) / Math.max(1, next.top - current.top)));
    return {
      base: mix(current.palette.base, next.palette.base, amount),
      glowOne: mix(current.palette.glowOne, next.palette.glowOne, amount),
      glowTwo: mix(current.palette.glowTwo, next.palette.glowTwo, amount),
    };
  };

  const updateClouds = (palette) => {
    const lag = clamp(targetScroll - renderedScroll, -360, 360);
    const phase = renderedScroll / Math.max(720, window.innerHeight * 1.08);
    const velocityLean = clamp(scrollVelocity * .016, -26, 26);
    const transforms = [
      `translate3d(${Math.sin(phase * .86) * window.innerWidth * .052}px, ${Math.cos(phase * .56) * 34 - lag * .3}px, 0) rotate(${Math.sin(phase * .46) * 3 + velocityLean * .1}deg) scale(${1.08 + Math.sin(phase * .38) * .04})`,
      `translate3d(${Math.cos(phase * .7) * window.innerWidth * -.058}px, ${Math.sin(phase * .72) * 42 - lag * .2}px, 0) rotate(${Math.cos(phase * .4) * -4 - velocityLean * .08}deg) scale(${1.1 + Math.cos(phase * .33) * .045})`,
      `translate3d(${Math.sin(phase * .52 + 1.4) * window.innerWidth * .042}px, ${Math.cos(phase * .48 + .8) * 30 + lag * .12}px, 0) rotate(${Math.sin(phase * .35 + .6) * 2.4}deg) scale(${1.06 + Math.sin(phase * .3) * .03})`,
    ];
    clouds.forEach((cloud, index) => { cloud.style.transform = transforms[index]; });
    document.documentElement.style.setProperty("--ambient-base", rgb(palette.base));
    document.documentElement.style.setProperty("--ambient-glow-one", rgb(palette.glowOne));
    document.documentElement.style.setProperty("--ambient-glow-two", rgb(palette.glowTwo));
  };

  const render = (time = performance.now()) => {
    frame = 0;
    if (anchors.length < 2) measure();
    targetScroll = window.scrollY;
    const deltaTime = previousTime ? Math.min(.032, (time - previousTime) / 1000) : 1 / 60;
    previousTime = time;
    if (reducedMotion.matches) {
      renderedScroll = targetScroll;
      scrollVelocity = 0;
    } else {
      const displacement = targetScroll - renderedScroll;
      scrollVelocity += displacement * 15 * deltaTime;
      scrollVelocity *= Math.exp(-4.8 * deltaTime);
      renderedScroll += scrollVelocity * deltaTime;
      if (Math.abs(displacement) < .1 && Math.abs(scrollVelocity) < .1) {
        renderedScroll = targetScroll;
        scrollVelocity = 0;
      }
    }
    updateClouds(paletteAt(renderedScroll));
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    progress.firstElementChild.style.transform = `scaleX(${maxScroll > 0 ? window.scrollY / maxScroll : 0})`;
    if (!reducedMotion.matches && (Math.abs(targetScroll - renderedScroll) >= .1 || Math.abs(scrollVelocity) >= .1)) frame = requestAnimationFrame(render);
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
