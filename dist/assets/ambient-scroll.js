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
  const adaptiveRootSelector = ".tracker-nav, .tracker-content";
  const fixedInkSelector = [
    ".tracker-hero",
    ".week-card.has-image",
    ".mission-clock-grid",
    ".mobile-photo-break",
    ".partner-logo-wall",
    ".inside-section-cta .tracker-button",
    ".sr-only",
    "[aria-live]",
    "script",
    "style",
    "noscript",
    "option",
    "select",
    "svg",
    "canvas",
  ].join(", ");
  const controlSelector = ".follow-form input, .follow-form textarea, .follow-form select, .rsvp-mobile-controls select, .tracker-menu-toggle";
  const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
  const mix = (start, end, amount) => start.map((channel, index) => channel + (end[index] - channel) * amount);
  const cubicMix = (start, controlOne, controlTwo, end, amount) => {
    const inverse = 1 - amount;
    return start.map((channel, index) =>
      inverse ** 3 * channel
      + 3 * inverse ** 2 * amount * controlOne[index]
      + 3 * inverse * amount ** 2 * controlTwo[index]
      + amount ** 3 * end[index]);
  };
  const composite = (foreground, backgroundColor, alpha) => foreground.map((channel, index) => channel * alpha + backgroundColor[index] * (1 - alpha));
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const rgb = (value) => value.map(Math.round).join(" ");
  const brandInk = [25, 59, 59];
  const linearChannel = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color) => color.reduce((total, channel, index) => total + linearChannel(channel) * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (foreground, backgroundColor) => {
    const lighter = Math.max(luminance(foreground), luminance(backgroundColor));
    const darker = Math.min(luminance(foreground), luminance(backgroundColor));
    return (lighter + 0.05) / (darker + 0.05);
  };
  const mixInk = (start, end, amount) => {
    const startLight = luminance(start) > 0.5;
    const endLight = luminance(end) > 0.5;
    if (startLight === endLight) return mix(start, end, amount);

    // Compress the vulnerable mid-lightness interval without removing any
    // values from the scroll-driven continuum. Light ink falls into the
    // branded dark range early; the reverse crossing stays dark until late.
    const chromaticAmount = startLight
      ? 1 - (1 - amount) ** 6
      : amount ** 6;

    // Travel through the Goodwin green instead of the muddy neutral gray
    // produced by a straight white-to-black RGB interpolation. The curve
    // enters the dark, chromatic range early (and exits it late in reverse),
    // preserving a continuous sweep without leaving low-contrast gray spread
    // across an entire line of type.
    const nearBrand = startLight
      ? mix(start, brandInk, 0.88)
      : mix(start, brandInk, 0.2);
    const farBrand = endLight
      ? mix(end, brandInk, 0.88)
      : mix(end, brandInk, 0.2);
    return cubicMix(start, nearBrand, farBrand, end, chromaticAmount);
  };
  const sweepInkAt = (x, y, backgroundColor) => {
    const backgroundLuminance = luminance(backgroundColor);
    const xRatio = clamp(x / Math.max(1, window.innerWidth));
    const yRatio = clamp(y / Math.max(1, window.innerHeight));
    const amount = smoothstep(clamp(currentPalette.amount * 1.38 - xRatio * 0.3 - yRatio * 0.08));
    const rawColor = mixInk(currentPalette.inkStart, currentPalette.inkEnd, amount);
    const rawScore = contrast(rawColor, backgroundColor);
    const preferredDarkAmount = smoothstep(clamp((backgroundLuminance - 0.14) / 0.28));
    const supportColor = mixInk([255, 253, 247], brandInk, preferredDarkAmount);
    const supportAmount = smoothstep(clamp((4.4 - rawScore) / 2.6)) * 0.92;
    const color = mixInk(rawColor, supportColor, supportAmount);
    const score = contrast(color, backgroundColor);
    return {
      color,
      amount,
      score,
      backgroundLuminance,
    };
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

  let anchors = [];
  let frame = 0;
  let currentPalette = palettes[0];
  let targetScroll = window.scrollY;
  let renderedScroll = targetScroll;
  let scrollVelocity = 0;
  let previousTime = 0;
  let controls = [];
  let cloudModels = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clouds = [...background.querySelectorAll(".ambient-scroll-cloud")];
  const activeWords = new Set();

  const wordObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) activeWords.add(entry.target);
          else activeWords.delete(entry.target);
        });
        requestRender();
      }, { rootMargin: "140px 80px" })
    : null;

  const registerWord = (word) => {
    if (wordObserver) wordObserver.observe(word);
    else activeWords.add(word);
  };

  const shouldSkipTextNode = (node) => {
    if (!node.nodeValue.trim()) return true;
    const parent = node.parentElement;
    return !parent || parent.closest(".ambient-word") || parent.closest(fixedInkSelector);
  };

  const instrumentTextNode = (node) => {
    if (shouldSkipTextNode(node)) return;
    const fragment = document.createDocumentFragment();
    const leadingWhitespace = node.nodeValue.match(/^\s+/)?.[0] || "";
    if (leadingWhitespace) fragment.append(document.createTextNode(leadingWhitespace));
    const content = node.nodeValue.slice(leadingWhitespace.length);
    (content.match(/\S+(?:\s+|$)/g) || []).forEach((part) => {
      const word = document.createElement("span");
      word.className = "ambient-word";
      word.textContent = part;
      fragment.append(word);
      registerWord(word);
    });
    node.replaceWith(fragment);
  };

  const instrumentRoot = (root) => {
    if (!(root instanceof Element) || root.matches(".ambient-word") || root.closest(".ambient-word")) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(instrumentTextNode);
  };

  const refreshAdaptiveTargets = () => {
    document.querySelectorAll(adaptiveRootSelector).forEach(instrumentRoot);
    controls = [...document.querySelectorAll(controlSelector)];
  };

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
    const raw = clamp((focus - start) / Math.max(1, end - start));
    const amount = smoothstep(raw);
    const current = palettes[Math.min(index, palettes.length - 1)];
    const next = palettes[Math.min(index + 1, palettes.length - 1)];

    return {
      base: mix(current.base, next.base, amount),
      glowOne: mix(current.glowOne, next.glowOne, amount),
      glowTwo: mix(current.glowTwo, next.glowTwo, amount),
      inkStart: current.ink,
      inkEnd: next.ink,
      amount,
    };
  };

  const updateCloudMotion = () => {
    const lag = Math.max(-180, Math.min(180, targetScroll - renderedScroll));
    const phase = renderedScroll / Math.max(720, window.innerHeight * 1.15);
    const velocityLean = Math.max(-34, Math.min(34, scrollVelocity * 0.018));
    cloudModels = [
      { left: -0.3, top: -0.34, width: 1.12, height: 1.05, x: Math.sin(phase * 1.18) * window.innerWidth * 0.045, y: Math.cos(phase * 0.86) * 28 - lag * 0.2, angle: Math.sin(phase * 0.72) * 3.2 + velocityLean * 0.08, scale: 1.06 + Math.sin(phase * 0.62) * 0.035, stops: [[0, currentPalette.glowOne, 0.82], [0.27, currentPalette.glowOne, 0.48], [0.7, currentPalette.glowOne, 0]], blend: "normal" },
      { left: 0.16, top: 0.24, width: 1.18, height: 1.12, x: Math.cos(phase * 0.91) * window.innerWidth * -0.055, y: Math.sin(phase * 1.04) * 38 - lag * 0.14, angle: Math.cos(phase * 0.58) * -4.5 - velocityLean * 0.06, scale: 1.08 + Math.cos(phase * 0.51) * 0.045, stops: [[0, currentPalette.glowTwo, 0.76], [0.31, currentPalette.glowTwo, 0.42], [0.72, currentPalette.glowTwo, 0]], blend: "normal" },
      { left: 0.22, top: 0.17, width: 0.72, height: 0.76, x: Math.sin(phase * 0.73 + 1.4) * window.innerWidth * 0.038, y: Math.cos(phase * 0.69 + 0.8) * 30 + lag * 0.1, angle: Math.sin(phase * 0.47 + 0.6) * 2.6, scale: 1.04 + Math.sin(phase * 0.43 + 0.5) * 0.03, stops: [[0, currentPalette.glowOne, 0.26], [0.38, currentPalette.glowTwo, 0.16], [0.74, currentPalette.glowTwo, 0]], blend: "soft-light" },
    ];
    clouds.forEach((cloud, index) => {
      const model = cloudModels[index];
      cloud.style.transform = `translate3d(${model.x}px, ${model.y}px, 0) rotate(${model.angle}deg) scale(${model.scale})`;
    });
    document.documentElement.style.setProperty("--ambient-cloud-lag", Math.abs(lag).toFixed(2));
  };

  const interpolateStop = (stops, amount) => {
    const upperIndex = stops.findIndex(([position]) => amount <= position);
    if (upperIndex <= 0) return { color: stops[0][1], alpha: stops[0][2] };
    if (upperIndex === -1) return { color: stops.at(-1)[1], alpha: stops.at(-1)[2] };
    const lower = stops[upperIndex - 1];
    const upper = stops[upperIndex];
    const progress = clamp((amount - lower[0]) / Math.max(0.0001, upper[0] - lower[0]));
    return {
      color: mix(lower[1], upper[1], progress),
      alpha: lower[2] + (upper[2] - lower[2]) * progress,
    };
  };

  const softLightChannel = (backdrop, source) => {
    const base = backdrop / 255;
    const blend = source / 255;
    const curve = base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base);
    const result = blend <= 0.5
      ? base - (1 - 2 * blend) * base * (1 - base)
      : base + (2 * blend - 1) * (curve - base);
    return result * 255;
  };

  const sampleCloudAt = (backgroundColor, model, x, y) => {
    const width = window.innerWidth * model.width;
    const height = window.innerHeight * model.height;
    const centerX = window.innerWidth * model.left + width * 0.5 + model.x;
    const centerY = window.innerHeight * model.top + height * 0.5 + model.y;
    const angle = -model.angle * Math.PI / 180;
    const deltaX = x - centerX;
    const deltaY = y - centerY;
    const localX = (deltaX * Math.cos(angle) - deltaY * Math.sin(angle)) / model.scale;
    const localY = (deltaX * Math.sin(angle) + deltaY * Math.cos(angle)) / model.scale;
    const radius = Math.hypot(localX / (width * Math.SQRT1_2), localY / (height * Math.SQRT1_2));
    const sample = interpolateStop(model.stops, radius);
    const alpha = sample.alpha * 0.9;
    if (alpha <= 0) return backgroundColor;
    if (model.blend === "soft-light") {
      const blended = backgroundColor.map((channel, index) => softLightChannel(channel, sample.color[index]));
      return composite(blended, backgroundColor, alpha);
    }
    return composite(sample.color, backgroundColor, alpha);
  };

  const linearWashAt = (x, y) => {
    const angle = 125 * Math.PI / 180;
    const direction = { x: Math.sin(angle), y: -Math.cos(angle) };
    const corners = [[0, 0], [window.innerWidth, 0], [0, window.innerHeight], [window.innerWidth, window.innerHeight]];
    const projections = corners.map(([cornerX, cornerY]) => cornerX * direction.x + cornerY * direction.y);
    const minimum = Math.min(...projections);
    const maximum = Math.max(...projections);
    const amount = clamp((x * direction.x + y * direction.y - minimum) / Math.max(1, maximum - minimum));
    if (amount <= 0.42) return { color: [255, 255, 255], alpha: 0.04 * (1 - amount / 0.42) };
    return { color: [0, 0, 0], alpha: 0.08 * ((amount - 0.42) / 0.58) };
  };

  const sampleAmbientAt = (x, y, element = null) => {
    let sample = [...currentPalette.base];
    cloudModels.forEach((model) => {
      sample = sampleCloudAt(sample, model, x, y);
    });
    const wash = linearWashAt(x, y);
    sample = composite(wash.color, sample, wash.alpha);
    if (element?.closest(".tracker-nav")) sample = composite(currentPalette.base, sample, 0.82);
    if (element?.closest(".tracking-map-key")) sample = composite(currentPalette.base, sample, 0.76);
    return sample;
  };

  const applyInk = (element, ink, property) => {
    element.style.setProperty(property, rgb(ink.color));
    element.dataset.ambientTone = ink.amount.toFixed(4);
    element.dataset.ambientContrast = ink.score.toFixed(2);
    element.dataset.ambientBackgroundLuminance = ink.backgroundLuminance.toFixed(3);
  };

  const updateWords = () => {
    const measurements = [];
    activeWords.forEach((word) => {
      if (!word.isConnected) {
        activeWords.delete(word);
        return;
      }
      if (word.closest("[hidden]")) return;
      const rect = word.getBoundingClientRect();
      if (rect.bottom < -140 || rect.top > window.innerHeight + 140 || rect.width === 0 || rect.height === 0) return;
      measurements.push({ word, x: clamp(rect.left + rect.width * 0.5, 0, window.innerWidth), y: clamp(rect.top + rect.height * 0.5, 0, window.innerHeight) });
    });
    measurements.forEach(({ word, x, y }) => {
      const sample = sampleAmbientAt(x, y, word);
      applyInk(word, sweepInkAt(x, y, sample), "--ambient-word-ink");
    });
  };

  const updateControls = () => {
    controls.forEach((control) => {
      const rect = control.getBoundingClientRect();
      if (rect.bottom < -140 || rect.top > window.innerHeight + 140 || rect.width === 0 || rect.height === 0) return;
      const x = rect.left + rect.width * 0.5;
      const y = rect.top + rect.height * 0.5;
      const sample = sampleAmbientAt(x, y, control);
      applyInk(control, sweepInkAt(x, y, sample), "--ambient-control-ink");
    });

    const mark = document.querySelector(".tracker-mark");
    if (mark) {
      const rect = mark.getBoundingClientRect();
      const x = rect.left + rect.width * 0.5;
      const y = rect.top + rect.height * 0.5;
      const ink = sweepInkAt(x, y, sampleAmbientAt(x, y, mark));
      const logoLightness = clamp(luminance(ink.color));
      mark.style.setProperty("--ambient-logo-lightness", logoLightness.toFixed(4));
      mark.dataset.ambientTone = ink.amount.toFixed(4);
      mark.dataset.ambientContrast = ink.score.toFixed(2);
    }
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

    currentPalette = paletteAt(renderedScroll);
    document.documentElement.style.setProperty("--ambient-base", rgb(currentPalette.base));
    document.documentElement.style.setProperty("--ambient-glow-one", rgb(currentPalette.glowOne));
    document.documentElement.style.setProperty("--ambient-glow-two", rgb(currentPalette.glowTwo));
    document.documentElement.dataset.ambientMotion = renderedScroll === targetScroll ? "settled" : "moving";

    updateCloudMotion();
    const structuralX = window.innerWidth * 0.5;
    const structuralY = window.innerHeight * 0.5;
    const structuralInk = sweepInkAt(structuralX, structuralY, sampleAmbientAt(structuralX, structuralY));
    document.documentElement.style.setProperty("--ambient-ink", rgb(structuralInk.color));
    document.documentElement.dataset.ambientTone = structuralInk.amount.toFixed(4);
    document.documentElement.dataset.ambientContrast = structuralInk.score.toFixed(2);
    updateWords();
    updateControls();

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

  refreshAdaptiveTargets();
  measure();
  render();

  const mutationObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element && !node.matches(".ambient-word")) instrumentRoot(node);
        else if (node.nodeType === Node.TEXT_NODE) instrumentTextNode(node);
      });
    });
    controls = [...document.querySelectorAll(controlSelector)];
    measure();
    requestRender();
  });
  const trackerPage = document.querySelector(".tracker-page");
  if (trackerPage) mutationObserver.observe(trackerPage, { childList: true, subtree: true });

  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", () => {
    measure();
    requestRender();
  });
  window.addEventListener("load", () => {
    refreshAdaptiveTargets();
    measure();
    requestRender();
  }, { once: true });
  reducedMotion.addEventListener("change", requestRender);
})();
