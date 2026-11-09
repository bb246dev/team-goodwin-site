const header = document.querySelector("[data-site-header]");
const toggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-primary-nav]");

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
