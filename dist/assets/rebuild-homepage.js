const header = document.querySelector("[data-site-header]");
const toggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-primary-nav]");
const toggleLabel = toggle?.querySelector("[data-nav-toggle-label]");
const mobileNavigation = window.matchMedia("(max-width: 820px)");
const pageRegions = document.querySelectorAll("main, footer");
let navigationReturnFocus = null;

const legacyHashDestinations = new Map([
  ["#map", "/portfolio/mission-america-2026/live-tracking.html"],
  ["#rsvp", "/portfolio/mission-america-2026/"],
  ["#the-run", "#story"],
  ["#why", "#story"],
]);

const legacyDestination = legacyHashDestinations.get(window.location.hash.toLowerCase());
if (legacyDestination?.startsWith("/")) {
  window.location.replace(legacyDestination);
} else if (legacyDestination) {
  history.replaceState(null, "", legacyDestination);
  document.querySelector(legacyDestination)?.scrollIntoView();
}

function navigationFocusables() {
  if (!header) return [];
  return [...header.querySelectorAll("a[href], button:not([disabled])")]
    .filter((element) => element.getClientRects().length > 0);
}

function setNavigation(open, { returnFocus = true } = {}) {
  if (!header || !toggle || !nav) return;
  const shouldOpen = Boolean(open && mobileNavigation.matches);

  if (shouldOpen) navigationReturnFocus = document.activeElement;
  header.classList.toggle("nav-open", shouldOpen);
  document.body.classList.toggle("mobile-menu-open", shouldOpen);
  toggle.setAttribute("aria-expanded", String(shouldOpen));
  toggle.setAttribute("aria-label", shouldOpen ? "Close menu" : "Open menu");
  if (toggleLabel) toggleLabel.textContent = shouldOpen ? "Close" : "Menu";
  pageRegions.forEach((region) => { region.inert = shouldOpen; });

  if (mobileNavigation.matches) {
    nav.setAttribute("aria-hidden", String(!shouldOpen));
  } else {
    nav.removeAttribute("aria-hidden");
  }

  if (shouldOpen) {
    nav.setAttribute("role", "dialog");
    nav.setAttribute("aria-modal", "true");
    nav.setAttribute("aria-label", "Menu");
  } else {
    nav.removeAttribute("role");
    nav.removeAttribute("aria-modal");
    nav.setAttribute("aria-label", "Primary navigation");
    if (returnFocus && navigationReturnFocus === toggle) toggle.focus();
    navigationReturnFocus = null;
  }
}

toggle?.addEventListener("click", () => {
  const willOpen = toggle.getAttribute("aria-expanded") !== "true";
  setNavigation(willOpen);
  if (willOpen) nav?.querySelector("a")?.focus();
});

nav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setNavigation(false, { returnFocus: false });
});

document.addEventListener("keydown", (event) => {
  const open = toggle?.getAttribute("aria-expanded") === "true";
  if (event.key === "Escape" && open) {
    event.preventDefault();
    setNavigation(false);
    return;
  }

  if (event.key !== "Tab" || !open) return;
  const focusables = navigationFocusables();
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

mobileNavigation.addEventListener("change", () => setNavigation(false, { returnFocus: false }));
setNavigation(false, { returnFocus: false });
