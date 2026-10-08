import { ROUTE_STOPS } from "__ROUTE_DATA_URL__";
import { createTrackingMap } from "__TRACKING_MAP_URL__";
import {
  resolveScheduledLocation,
  RV_REFRESH_MS,
  createAdaptivePoller,
  loadPublicRvLocation,
} from "__FEEDS_URL__";
import {
  GARMIN_FRESH_MS,
  GARMIN_MIN_REFRESH_MS,
  loadGarminRunnerLocation,
  resolveGarminDisplayLocation,
} from "__GARMIN_KML_URL__";

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
  panel.querySelector("[data-feed-state]").textContent = state === "live" ? name === "will" ? "Current Garmin fix" : "Live"
    : state === "stale" ? "Last known"
      : state === "scheduled" ? "Scheduled placement"
        : state === "loading" ? "Connecting" : "Unavailable";
  panel.querySelector("[data-feed-detail]").textContent = detail;
}

function staleCopy(name, result, interrupted = false) {
  const label = name === "rv" ? "RV" : "Garmin";
  const interruption = interrupted ? " Feed connection interrupted." : "";
  return `${label} last known location. Last updated ${formatUpdate(result.observedAt)}.${interruption}`;
}

async function startTrackingPreview() {
  const leafletModule = await import("__LEAFLET_URL__");
  const L = leafletModule.l;
  const tracker = createTrackingMap({
    L,
    element: mapElement,
    controls,
    routeStops: ROUTE_STOPS,
    markerAssets: { will: "__WILL_ICON_URL__", rv: "__RV_ICON_URL__" },
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    followLabels: { active: "Pause Auto Follow", paused: "Resume Auto Follow" },
    autoFollowSubject: "will",
  });
  mapElement.dataset.runnerSource = "garmin";
  mapElement.dataset.ready = "true";
  tracker.map.invalidateSize();

  const feedLocations = { rv: { available: false }, will: { available: false } };
  const renderLocation = (subject, feed, detail) => {
    if (feed) feedLocations[subject] = feed;
    const cached = feedLocations[subject];
    const live = subject === "will" && cached.available
      ? { ...cached, stale: cached.stale || Date.now() - Date.parse(cached.observedAt) > GARMIN_FRESH_MS }
      : cached;
    const result = subject === "will" ? live : resolveScheduledLocation(subject, live);
    if (subject === "rv") tracker.setRvLocation(result);
    else tracker.setWillLocation(result);
    if (result.scheduled) updateFeed(subject, "scheduled", `${result.label} · scheduled approximate location.`);
    else if (!result.available) updateFeed(subject, "unavailable", detail || "Waiting for a usable feed position.");
    else if (result.stale) updateFeed(subject, "stale", staleCopy(subject, result));
    else updateFeed(subject, "live", subject === "will"
      ? `Approximate Garmin location · updated ${formatUpdate(result.observedAt)}. Updates arrive about every 2 minutes.`
      : `Fresh ${subject === "rv" ? "RV" : "Will"} position · updated ${formatUpdate(result.observedAt)}.`);
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
  const runnerPoller = createAdaptivePoller({
    intervalMs: GARMIN_MIN_REFRESH_MS,
    minimumIntervalMs: GARMIN_MIN_REFRESH_MS,
    load: () => loadGarminRunnerLocation(),
    onData(result) {
      if (result.available) lastWill = result;
      renderLocation("will", resolveGarminDisplayLocation(result, lastWill),
        "Garmin feed connected; no usable approximate location is available. Checking again in about 2 minutes.");
    },
    onFailure() {
      renderLocation("will", resolveGarminDisplayLocation(null, lastWill),
        lastWill ? "Garmin feed connection interrupted." : "Garmin feed unavailable. Retrying no sooner than every 2 minutes.");
    },
  });
  void rvPoller.start();
  void runnerPoller.start();
}

startTrackingPreview().catch(() => {
  mapElement.dataset.state = "unavailable";
  mapElement.textContent = "The map could not be loaded. Feed checks will retry when this page is refreshed.";
});
