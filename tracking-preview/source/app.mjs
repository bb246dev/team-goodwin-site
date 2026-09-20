import { ROUTE_STOPS } from "__ROUTE_DATA_URL__";
import { createTrackingMap } from "__TRACKING_MAP_URL__";
import {
  RV_REFRESH_MS,
  WILL_REFRESH_MS,
  createAdaptivePoller,
  deriveWillLocation,
  loadPublicRaceSnapshot,
  loadPublicRvLocation,
} from "__FEEDS_URL__";

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
      : state === "loading" ? "Connecting" : "Unavailable";
  panel.querySelector("[data-feed-detail]").textContent = detail;
}

function staleCopy(name, result, interrupted = false) {
  const label = name === "rv" ? "RV" : "Will";
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
  });
  mapElement.dataset.ready = "true";
  tracker.map.invalidateSize();

  let lastRv = null;
  let lastWill = null;
  const rvPoller = createAdaptivePoller({
    intervalMs: RV_REFRESH_MS,
    load: () => loadPublicRvLocation(),
    onData(result) {
      if (result.available) lastRv = result;
      tracker.setRvLocation(result);
      if (!result.available) updateFeed("rv", "unavailable", "RV feed connected; no usable position is available.");
      else if (result.stale) updateFeed("rv", "stale", staleCopy("rv", result));
      else updateFeed("rv", "live", `Fresh RV position · updated ${formatUpdate(result.observedAt)}.`);
    },
    onFailure() {
      if (lastRv) {
        const stale = { ...lastRv, stale: true };
        tracker.setRvLocation(stale);
        updateFeed("rv", "stale", staleCopy("rv", stale, true));
      } else {
        tracker.setRvLocation({ available: false });
        updateFeed("rv", "unavailable", "RV feed unavailable. Retrying automatically.");
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
      tracker.setWillLocation(result);
      if (!result.available) updateFeed("will", "unavailable", "Will feed connected; waiting for a usable activity position.");
      else if (result.stale) updateFeed("will", "stale", staleCopy("will", result));
      else updateFeed("will", "live", `Fresh Will position · updated ${formatUpdate(result.observedAt)}.`);
    },
    onFailure() {
      if (lastWill) {
        const stale = { ...lastWill, stale: true };
        tracker.setWillLocation(stale);
        updateFeed("will", "stale", staleCopy("will", stale, true));
      } else {
        tracker.setWillLocation({ available: false });
        updateFeed("will", "unavailable", "Will feed unavailable. Showing the planned route and retrying automatically.");
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
