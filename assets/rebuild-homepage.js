const header = document.querySelector("[data-site-header]");
const toggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-primary-nav]");

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

function setNavigation(open) {
  if (!header || !toggle) return;
  header.classList.toggle("nav-open", open);
  toggle.setAttribute("aria-expanded", String(open));
}

toggle?.addEventListener("click", () => {
  setNavigation(toggle.getAttribute("aria-expanded") !== "true");
});

nav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setNavigation(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setNavigation(false);
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 820) setNavigation(false);
}, { passive: true });
