(() => {
  const palettes = [
    { base: [10, 30, 28], glowOne: [21, 69, 58], glowTwo: [43, 63, 82], ink: [246, 246, 239] },
    { base: [25, 59, 59], glowOne: [67, 111, 90], glowTwo: [60, 78, 108], ink: [248, 247, 239] },
    { base: [205, 213, 199], glowOne: [228, 219, 181], glowTwo: [155, 194, 181], ink: [18, 42, 39] },
    { base: [241, 229, 204], glowOne: [241, 191, 150], glowTwo: [190, 213, 196], ink: [27, 41, 39] },
    { base: [132, 83, 98], glowOne: [181, 119, 101], glowTwo: [72, 96, 119], ink: [253, 246, 238] },
    { base: [31, 46, 49], glowOne: [48, 75, 66], glowTwo: [45, 45, 76], ink: [247, 246, 240] },
    { base: [7, 20, 22], glowOne: [19, 47, 42], glowTwo: [31, 32, 58], ink: [245, 245, 239] },
  ];

  const anchorSelectors = ["#the-run", "#map", "#updates", "#articles", "#why", "#rsvp", ".site-footer"];
  const mix = (start, end, amount) => start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount));
  const composite = (foreground, background, alpha) => foreground.map((channel, index) => Math.round(channel * alpha + background[index] * (1 - alpha)));
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const rgb = (value) => value.join(" ");
  const inkChoices = {
    dark: [8, 17, 15],
    light: [255, 253, 247],
  };
  const linearChannel = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color) => color.reduce((total, channel, index) => total + linearChannel(channel) * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (foreground, background) => {
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  };
  const contrastSamples = (base, glowOne, glowTwo) => {
    const samples = [];
    [0, 0.24, 0.48, 0.72].forEach((oneAlpha) => {
      [0, 0.21, 0.42, 0.62].forEach((twoAlpha) => {
        samples.push(composite(glowOne, composite(glowTwo, base, twoAlpha), oneAlpha));
      });
    });
    return samples;
  };
  const minimumContrast = (ink, samples) => Math.min(...samples.map((sample) => contrast(ink, sample)));

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

  let anchors = [];
  let frame = 0;
  let inkMode = "";
  let targetScroll = window.scrollY;
  let renderedScroll = targetScroll;
  let scrollVelocity = 0;
  let previousTime = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clouds = [...background.querySelectorAll(".ambient-scroll-cloud")];

  const measure = () => {
    anchors = anchorSelectors
      .map((selector) => document.querySelector(selector))
      .filter(Boolean)
      .map((element) => element.getBoundingClientRect().top + window.scrollY);
  };

  const paletteAt = (scrollPosition) => {
    const focus = scrollPosition + window.innerHeight * 0.5;
    let index = 0;
    while (index < anchors.length - 2 && focus >= anchors[index + 1]) index += 1;

    const start = anchors[index] ?? 0;
    const end = anchors[index + 1] ?? document.documentElement.scrollHeight;
    const raw = Math.min(1, Math.max(0, (focus - start) / Math.max(1, end - start)));
    const amount = smoothstep(raw);
    const current = palettes[Math.min(index, palettes.length - 1)];
    const next = palettes[Math.min(index + 1, palettes.length - 1)];

    return {
      base: mix(current.base, next.base, amount),
      glowOne: mix(current.glowOne, next.glowOne, amount),
      glowTwo: mix(current.glowTwo, next.glowTwo, amount),
    };
  };

  const updateCloudMotion = () => {
    const lag = Math.max(-180, Math.min(180, targetScroll - renderedScroll));
    const phase = renderedScroll / Math.max(720, window.innerHeight * 1.15);
    const velocityLean = Math.max(-34, Math.min(34, scrollVelocity * 0.018));
    const transforms = [
      `translate3d(${Math.sin(phase * 1.18) * 4.5}vw, ${Math.cos(phase * 0.86) * 28 - lag * 0.2}px, 0) rotate(${Math.sin(phase * 0.72) * 3.2 + velocityLean * 0.08}deg) scale(${1.06 + Math.sin(phase * 0.62) * 0.035})`,
      `translate3d(${Math.cos(phase * 0.91) * -5.5}vw, ${Math.sin(phase * 1.04) * 38 - lag * 0.14}px, 0) rotate(${Math.cos(phase * 0.58) * -4.5 - velocityLean * 0.06}deg) scale(${1.08 + Math.cos(phase * 0.51) * 0.045})`,
      `translate3d(${Math.sin(phase * 0.73 + 1.4) * 3.8}vw, ${Math.cos(phase * 0.69 + 0.8) * 30 + lag * 0.1}px, 0) rotate(${Math.sin(phase * 0.47 + 0.6) * 2.6}deg) scale(${1.04 + Math.sin(phase * 0.43 + 0.5) * 0.03})`,
    ];
    clouds.forEach((cloud, index) => {
      cloud.style.transform = transforms[index];
    });
    document.documentElement.style.setProperty("--ambient-cloud-lag", Math.abs(lag).toFixed(2));
  };

  const render = (time = performance.now()) => {
    frame = 0;
    if (anchors.length < 2) measure();

    targetScroll = window.scrollY;
    const deltaTime = previousTime ? Math.min(0.034, (time - previousTime) / 1000) : 1 / 60;
    previousTime = time;
    if (reducedMotion.matches) {
      renderedScroll = targetScroll;
      scrollVelocity = 0;
    } else {
      const displacement = targetScroll - renderedScroll;
      scrollVelocity += displacement * 44 * deltaTime;
      scrollVelocity *= Math.exp(-9.2 * deltaTime);
      renderedScroll += scrollVelocity * deltaTime;
      if (Math.abs(displacement) < 0.12 && Math.abs(scrollVelocity) < 0.12) {
        renderedScroll = targetScroll;
        scrollVelocity = 0;
      }
    }

    const { base, glowOne, glowTwo } = paletteAt(renderedScroll);
    const samples = contrastSamples(base, glowOne, glowTwo);
    const scores = {
      dark: minimumContrast(inkChoices.dark, samples),
      light: minimumContrast(inkChoices.light, samples),
    };
    const bestMode = scores.dark >= scores.light ? "dark" : "light";
    const currentScore = inkMode ? scores[inkMode] : 0;
    if (!inkMode || currentScore < 4.5 || scores[bestMode] > currentScore + 0.6) inkMode = bestMode;

    document.documentElement.style.setProperty("--ambient-base", rgb(base));
    document.documentElement.style.setProperty("--ambient-glow-one", rgb(glowOne));
    document.documentElement.style.setProperty("--ambient-glow-two", rgb(glowTwo));
    document.documentElement.style.setProperty("--ambient-ink", rgb(inkChoices[inkMode]));
    document.documentElement.dataset.ambientInk = inkMode;
    document.documentElement.dataset.ambientContrast = scores[inkMode].toFixed(2);
    document.documentElement.dataset.ambientMotion = renderedScroll === targetScroll ? "settled" : "moving";

    updateCloudMotion();

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    progress.firstElementChild.style.transform = `scaleX(${maxScroll > 0 ? window.scrollY / maxScroll : 0})`;

    if (!reducedMotion.matches && (Math.abs(targetScroll - renderedScroll) >= 0.12 || Math.abs(scrollVelocity) >= 0.12)) {
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
  window.addEventListener("resize", () => {
    measure();
    requestRender();
  });
  window.addEventListener("load", () => {
    measure();
    requestRender();
  }, { once: true });
  reducedMotion.addEventListener("change", requestRender);
})();
