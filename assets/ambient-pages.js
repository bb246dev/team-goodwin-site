(() => {
  const palettes = [
    { base: [10, 30, 28], glowOne: [21, 69, 58], glowTwo: [43, 63, 82], ink: [246, 246, 239] },
    { base: [53, 82, 74], glowOne: [91, 128, 100], glowTwo: [72, 91, 121], ink: [250, 248, 240] },
    { base: [218, 220, 205], glowOne: [239, 222, 181], glowTwo: [171, 204, 188], ink: [20, 42, 39] },
    { base: [239, 224, 198], glowOne: [237, 185, 148], glowTwo: [190, 210, 191], ink: [29, 40, 38] },
    { base: [101, 68, 82], glowOne: [154, 99, 92], glowTwo: [61, 77, 104], ink: [251, 246, 240] },
    { base: [8, 22, 24], glowOne: [19, 49, 43], glowTwo: [32, 34, 60], ink: [245, 245, 239] },
  ];

  const mix = (start, end, amount) => start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount));
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const rgb = (value) => value.join(" ");
  const background = document.createElement("div");
  background.className = "ambient-pages-background";
  background.setAttribute("aria-hidden", "true");
  document.body.prepend(background);
  document.body.classList.add("has-ambient-pages");

  let frame = 0;
  const render = () => {
    frame = 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const position = Math.min(1, Math.max(0, window.scrollY / maxScroll)) * (palettes.length - 1);
    const index = Math.min(Math.floor(position), palettes.length - 2);
    const amount = smoothstep(position - index);
    const current = palettes[index];
    const next = palettes[index + 1];
    document.documentElement.style.setProperty("--ambient-base", rgb(mix(current.base, next.base, amount)));
    document.documentElement.style.setProperty("--ambient-glow-one", rgb(mix(current.glowOne, next.glowOne, amount)));
    document.documentElement.style.setProperty("--ambient-glow-two", rgb(mix(current.glowTwo, next.glowTwo, amount)));
    document.documentElement.style.setProperty("--ambient-ink", rgb(mix(current.ink, next.ink, amount)));
  };

  const requestRender = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  render();
  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", requestRender);
})();
