(() => {
  const message = "This is an archived 2026 event portfolio. Signups and participation forms are closed and no information is submitted.";
  const banner = document.querySelector(".mission-archive-banner");
  const syncBannerHeight = () => {
    document.documentElement.style.setProperty("--mission-archive-banner-height", `${banner?.offsetHeight || 42}px`);
  };
  syncBannerHeight();
  window.addEventListener("resize", syncBannerHeight, { passive: true });

  if (!["home", "live-tracking"].includes(document.body.dataset.archiveRoute || "")) {
    const nav = document.querySelector(".tracker-nav");
    const toggle = document.querySelector(".tracker-menu-toggle");
    const navlinks = document.querySelector(".tracker-navlinks");
    const closeMenu = () => {
      nav?.classList.remove("is-open");
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.setAttribute("aria-label", "Open navigation menu");
    };
    toggle?.addEventListener("click", () => {
      const open = !nav?.classList.contains("is-open");
      nav?.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    });
    navlinks?.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  document.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const notice = document.createElement("p");
    notice.className = "mission-archive-notice";
    notice.textContent = message;
    form.replaceWith(notice);
  }, true);

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!href.includes("tally.so") && !link.matches("[data-archive-participation]")) return;
    event.preventDefault();
    document.querySelector("#archived-event")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
})();
