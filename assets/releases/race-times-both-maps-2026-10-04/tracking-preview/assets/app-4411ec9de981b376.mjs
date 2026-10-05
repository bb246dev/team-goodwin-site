import { ROUTE_STOPS } from "/tracking-preview/assets/route-data-64cfb1be0b0d345b.mjs";
import { createTrackingMap } from "/tracking-preview/assets/tracking-map-a383bdc843e41141.mjs";
import {
  resolveScheduledLocation,
  RV_REFRESH_MS,
  WILL_REFRESH_MS,
  WILL_FRESH_MS,
  createAdaptivePoller,
  deriveWillLocation,
  loadPublicRaceSnapshot,
  loadPublicRvLocation,
} from "/tracking-preview/assets/feeds-14a9da15157f0119.mjs";

const mapElement = document.getElementById("tracking-map");
const controls = document.querySelector("[data-map-controls]");
const feedPanels = {
  rv: document.querySelector('[data-feed="rv"]'),
  will: document.querySelector('[data-feed="will"]'),
};

function formatUpdate(value) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

function updateFeed(name, state, detail) {
  const panel = feedPanels[name];
  if (!panel) return;
  panel.dataset.state = state;
  panel.querySelector("[data-feed-state]").textContent = state === "live" ? "Live"
    : state === "stale" ? "Last known"
      : state === "scheduled" ? "Scheduled placement"
        : state === "loading" ? "Connecting" : "Unavailable";
  panel.querySelector("[data-feed-detail]").textContent = detail;
}

function staleCopy(name, result, interrupted = false) {
  const label = name === "rv" ? "RV" : "Will";
  const interruption = interrupted ? " Feed connection interrupted." : "";
  return `${label} last known location. Last updated ${formatUpdate(result.observedAt)}.${interruption}`;
}

async function startTrackingPreview() {
  const leafletModule = await import("/tracking-preview/assets/leaflet-5e4d4e4e1f8aedf8.mjs");
  const L = leafletModule.l;
  const tracker = createTrackingMap({
    L,
    element: mapElement,
    controls,
    routeStops: ROUTE_STOPS,
    markerAssets: { will: "/tracking-preview/assets/will-marker-56ab69d63f325765.png", rv: "/tracking-preview/assets/rv-marker-2f7beea761de0104.png" },
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  mapElement.dataset.ready = "true";
  tracker.map.invalidateSize();

  const feedLocations = { rv: { available: false }, will: { available: false } };
  const renderLocation = (subject, feed, detail) => {
    if (feed) feedLocations[subject] = feed;
    const cached = feedLocations[subject];
    const live = subject === "will" && cached.available
      ? { ...cached, stale: cached.stale || Date.now() - Date.parse(cached.observedAt) > WILL_FRESH_MS }
      : cached;
    const result = resolveScheduledLocation(subject, live);
    if (subject === "rv") tracker.setRvLocation(result);
    else tracker.setWillLocation(result);
    if (result.scheduled) updateFeed(subject, "scheduled", `${result.label} · scheduled approximate location.`);
    else if (!result.available) updateFeed(subject, "unavailable", detail || "Waiting for a usable feed position.");
    else if (result.stale) updateFeed(subject, "stale", staleCopy(subject, result));
    else updateFeed(subject, "live", `Fresh ${subject === "rv" ? "RV" : "Will"} position · updated ${formatUpdate(result.observedAt)}.`);
  };
  // Evaluate independently of network responses, including during feed outages.
  const refreshPlacements = () => {
    renderLocation("rv");
    renderLocation("will");
  };
  refreshPlacements();
  window.setInterval(refreshPlacements, 1000);
  document.addEventListener("visibilitychange", refreshPlacements);
  let lastRv = null;
  let lastWill = null;
  const rvPoller = createAdaptivePoller({
    intervalMs: RV_REFRESH_MS,
    load: () => loadPublicRvLocation(),
    onData(result) {
      if (result.available) lastRv = result;
      renderLocation("rv", result, "RV feed connected; no usable position is available.");
    },
    onFailure() {
      if (lastRv) {
        const stale = { ...lastRv, stale: true };
        renderLocation("rv", stale);
      } else {
        renderLocation("rv", { available: false }, "RV feed unavailable. Retrying automatically.");
      }
    },
  });
  const willPoller = createAdaptivePoller({
    intervalMs: WILL_REFRESH_MS,
    load: () => loadPublicRaceSnapshot({ staticStops: ROUTE_STOPS }),
    onData(snapshot) {
      tracker.setRoute(snapshot.races);
      const result = deriveWillLocation(snapshot);
      if (result.available) lastWill = result;
      renderLocation("will", result, "Will feed connected; waiting for a usable activity position.");
    },
    onFailure() {
      if (lastWill) {
        const stale = { ...lastWill, stale: true };
        renderLocation("will", stale);
      } else {
        renderLocation("will", { available: false }, "Will feed unavailable. Showing the planned route and retrying automatically.");
      }
    },
  });
  void rvPoller.start();
  void willPoller.start();
}

startTrackingPreview().catch(() => {
  mapElement.dataset.state = "unavailable";
  mapElement.textContent = "The map could not be loaded. Feed checks will retry when this page is refreshed.";
});
