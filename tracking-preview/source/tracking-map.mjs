export const PREVIEW_TILE_PROVIDER = Object.freeze({
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  maxNativeZoom: 10,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
});
export const MAX_NATIVE_ZOOM = PREVIEW_TILE_PROVIDER.maxNativeZoom;
export const FOLLOW_ZOOM = 10;
export const TRACKING_STATE = Object.freeze({ LIVE: "live", STALE: "stale", UNAVAILABLE: "unavailable" });

export function validCoordinate(value) {
  const lat = value?.lat;
  const lng = value?.lng;
  return typeof lat === "number" && typeof lng === "number"
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    && !(lat === 0 && lng === 0);
}

function routeCoordinates(stops) {
  return stops.filter(validCoordinate).map((stop) => [stop.lat, stop.lng]);
}

function unavailableLocation() {
  return { kind: TRACKING_STATE.UNAVAILABLE, position: null, observedAt: null };
}

export function classifyTrackedLocation(result) {
  const observedMs = Date.parse(result?.observedAt);
  if (result?.available !== true || typeof result.stale !== "boolean"
    || !validCoordinate(result.position) || !Number.isFinite(observedMs)) {
    return unavailableLocation();
  }
  return {
    kind: result.stale ? TRACKING_STATE.STALE : TRACKING_STATE.LIVE,
    position: { lat: result.position.lat, lng: result.position.lng },
    observedAt: new Date(observedMs).toISOString(),
  };
}

export const classifyRvLocation = classifyTrackedLocation;

function formattedUpdate(observedAt) {
  return new Date(observedAt).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

function sameCoordinate(a, b) {
  return Boolean(a && b && a.lat === b.lat && a.lng === b.lng);
}

function freshAdvance(previous, next) {
  if (next.kind !== TRACKING_STATE.LIVE) return false;
  if (previous.kind !== TRACKING_STATE.LIVE) return true;
  return Date.parse(next.observedAt) > Date.parse(previous.observedAt)
    || !sameCoordinate(previous.position, next.position);
}

export function createTrackingMap({
  L,
  element,
  controls,
  routeStops,
  markerAssets,
  reducedMotion = false,
  tileProvider = PREVIEW_TILE_PROVIDER,
}) {
  const map = L.map(element, {
    zoomControl: true,
    scrollWheelZoom: true,
    keyboard: true,
    maxZoom: FOLLOW_ZOOM,
    worldCopyJump: true,
    bounceAtZoomLimits: false,
  });
  const tileLayer = L.tileLayer(tileProvider.url, {
    maxZoom: FOLLOW_ZOOM,
    maxNativeZoom: Math.min(tileProvider.maxNativeZoom, FOLLOW_ZOOM),
    detectRetina: false,
    attribution: tileProvider.attribution,
  }).addTo(map);
  const positions = { will: null, rv: null };
  const states = { will: unavailableLocation(), rv: unavailableLocation() };
  const markers = { will: null, rv: null };
  const buttons = {
    live: controls.querySelector('[data-follow="live"]'),
    will: controls.querySelector('[data-follow="will"]'),
    rv: controls.querySelector('[data-follow="rv"]'),
    route: controls.querySelector('[data-follow="route"]'),
  };
  const markerIcons = {
    will: L.icon({ iconUrl: markerAssets.will, iconSize: [34, 51], iconAnchor: [17, 51], alt: "Will current location", className: "tracking-map-entity tracking-map-will" }),
    willStale: L.icon({ iconUrl: markerAssets.will, iconSize: [34, 51], iconAnchor: [17, 51], alt: "Will last known location", className: "tracking-map-entity tracking-map-will tracking-map-will-stale" }),
    rv: L.icon({ iconUrl: markerAssets.rv, iconSize: [54, 36], iconAnchor: [27, 18], alt: "RV current location", className: "tracking-map-entity tracking-map-rv" }),
    rvStale: L.icon({ iconUrl: markerAssets.rv, iconSize: [54, 36], iconAnchor: [27, 18], alt: "RV last known location", className: "tracking-map-entity tracking-map-rv tracking-map-rv-stale" }),
  };
  let stops = routeStops;
  let routeLayers = [];
  let following = null;
  let liveFollow = true;
  let viewMode = "live";
  let programmaticMove = false;

  const freshSubjects = () => ["will", "rv"].filter((subject) => states[subject].kind === TRACKING_STATE.LIVE && positions[subject]);
  const updateButtons = () => {
    buttons.live.textContent = liveFollow ? "Pause Live Follow" : "Resume Live Follow";
    buttons.live.setAttribute("aria-pressed", String(liveFollow));
    buttons.live.title = liveFollow ? "Pause automatic map following" : "Resume automatic map following";
    buttons.will.textContent = states.will.kind === TRACKING_STATE.STALE ? "Show Will Last Known" : "Follow Will";
    buttons.will.disabled = !positions.will;
    buttons.will.setAttribute("aria-pressed", String(!liveFollow && following === "will"));
    buttons.will.title = !positions.will ? "Will location currently unavailable"
      : states.will.kind === TRACKING_STATE.STALE ? "Show Will's last known location" : "Follow Will";
    buttons.rv.textContent = states.rv.kind === TRACKING_STATE.STALE ? "Show RV Last Known" : "Follow RV";
    buttons.rv.disabled = !positions.rv;
    buttons.rv.setAttribute("aria-pressed", String(!liveFollow && following === "rv"));
    buttons.rv.title = !positions.rv ? "RV location currently unavailable"
      : states.rv.kind === TRACKING_STATE.STALE ? "Show RV last known location" : "Follow RV";
    buttons.route.setAttribute("aria-pressed", String(viewMode === "route"));
  };
  const focusOn = (subject, animate = true) => {
    const point = positions[subject];
    if (!point) return;
    programmaticMove = true;
    map.fitBounds(L.latLngBounds([[point.lat, point.lng]]), {
      padding: element.clientWidth < 480 ? [42, 42] : [72, 72],
      animate: Boolean(animate && !reducedMotion),
      maxZoom: FOLLOW_ZOOM,
    });
    queueMicrotask(() => { programmaticMove = false; });
  };
  const panTo = (subject, animate = true) => {
    const point = positions[subject];
    if (!point) return;
    programmaticMove = true;
    map.panTo([point.lat, point.lng], { animate: Boolean(animate && !reducedMotion) });
    queueMicrotask(() => { programmaticMove = false; });
  };
  const fitFreshSubjects = (subjects, animate = true, maxZoom = FOLLOW_ZOOM) => {
    const points = subjects.map((subject) => [positions[subject].lat, positions[subject].lng]);
    programmaticMove = true;
    map.fitBounds(L.latLngBounds(points), {
      padding: element.clientWidth < 480 ? [42, 42] : [72, 72],
      animate: Boolean(animate && !reducedMotion),
      maxZoom: Math.min(maxZoom, FOLLOW_ZOOM),
    });
    queueMicrotask(() => { programmaticMove = false; });
  };
  const followFresh = (animate = true, focusSingle = false) => {
    if (!liveFollow) return;
    const subjects = freshSubjects();
    following = subjects.length === 1 ? subjects[0] : subjects.length === 2 ? "both" : null;
    if (subjects.length) viewMode = "live";
    updateButtons();
    if (subjects.length === 1) {
      if (focusSingle) focusOn(subjects[0], animate);
      else panTo(subjects[0], animate);
    } else if (subjects.length === 2) {
      fitFreshSubjects(subjects, animate);
    }
  };
  const fullRoute = () => {
    liveFollow = false;
    following = null;
    viewMode = "route";
    updateButtons();
    const points = [...routeCoordinates(stops), ...Object.values(positions).filter(Boolean).map((point) => [point.lat, point.lng])];
    if (!points.length) return;
    const padding = element.clientWidth < 480 ? [18, 18] : [32, 32];
    map.fitBounds(L.latLngBounds(points), { padding, animate: !reducedMotion, maxZoom: FOLLOW_ZOOM });
  };
  const initializeViewport = () => {
    const points = routeCoordinates(stops);
    if (!points.length) return;
    programmaticMove = true;
    map.fitBounds(L.latLngBounds(points), {
      padding: element.clientWidth < 480 ? [18, 18] : [32, 32],
      animate: false,
      maxZoom: FOLLOW_ZOOM,
    });
    queueMicrotask(() => { programmaticMove = false; });
  };
  const manualMove = () => {
    if (programmaticMove) return;
    following = null;
    if (viewMode !== "route") viewMode = "manual";
    updateButtons();
  };
  map.on("dragstart", manualMove);
  map.on("zoomend", () => {
    if (programmaticMove || !liveFollow) return;
    const subjects = freshSubjects();
    if (subjects.length === 1) panTo(subjects[0], false);
    else if (subjects.length === 2) fitFreshSubjects(subjects, false, map.getZoom());
  });
  buttons.live.addEventListener("click", () => {
    liveFollow = !liveFollow;
    following = null;
    viewMode = liveFollow ? "live" : "manual";
    updateButtons();
    if (liveFollow) followFresh(false, true);
  });
  buttons.will.addEventListener("click", () => {
    if (!positions.will) return;
    liveFollow = false;
    following = states.will.kind === TRACKING_STATE.LIVE ? "will" : null;
    viewMode = states.will.kind === TRACKING_STATE.LIVE ? "will" : "will-last-known";
    updateButtons();
    focusOn("will", false);
  });
  buttons.rv.addEventListener("click", () => {
    if (!positions.rv) return;
    liveFollow = false;
    following = states.rv.kind === TRACKING_STATE.LIVE ? "rv" : null;
    viewMode = states.rv.kind === TRACKING_STATE.LIVE ? "rv" : "rv-last-known";
    updateButtons();
    focusOn("rv", false);
  });
  buttons.route.addEventListener("click", fullRoute);

  const paintRoute = () => {
    routeLayers.forEach((layer) => map.removeLayer(layer));
    routeLayers = [];
    const flightLegs = new Set(["1-2", "2-3", "4-5", "24-25", "25-26", "32-33"]);
    for (let index = 1; index < stops.length; index += 1) {
      const from = stops[index - 1];
      const to = stops[index];
      if (!validCoordinate(from) || !validCoordinate(to)) continue;
      const flight = flightLegs.has(`${from.n}-${to.n}`);
      const completed = !flight && from.status === "completed" && to.status === "completed";
      routeLayers.push(L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
        color: completed ? "#5eead4" : "#fff", weight: completed ? 4 : flight ? 2.6 : 2,
        opacity: completed ? 1 : flight ? 0.78 : 0.34,
        dashArray: completed ? "2 13" : flight ? "12 10" : undefined,
        interactive: false,
      }).addTo(map));
    }
    for (const stop of stops) {
      if (!validCoordinate(stop)) continue;
      routeLayers.push(L.circleMarker([stop.lat, stop.lng], {
        radius: stop.n === 1 || stop.n === 50 ? 6 : 4,
        color: "#fff", fillColor: stop.n === 1 || stop.n === 50 ? "#5eead4" : "#0a0a0a", fillOpacity: 1, weight: 2,
      }).bindTooltip(`${stop.n}. ${stop.city}, ${stop.state}`).addTo(map));
    }
  };
  const setLocation = (subject, result) => {
    const previous = states[subject];
    const next = classifyTrackedLocation(result);
    const advanced = freshAdvance(previous, next);
    states[subject] = next;
    positions[subject] = next.position;
    if (next.position) {
      const point = [next.position.lat, next.position.lng];
      const stale = next.kind === TRACKING_STATE.STALE;
      const icon = markerIcons[stale ? `${subject}Stale` : subject];
      if (markers[subject]) {
        markers[subject].setLatLng(point);
        if (previous.kind !== next.kind) markers[subject].setIcon(icon);
      } else {
        markers[subject] = L.marker(point, { icon, zIndexOffset: subject === "rv" ? 2000 : 2100 }).addTo(map);
      }
      const label = subject === "rv" ? "RV" : "Will";
      const popup = stale
        ? `<strong>${label} last known location</strong><br>Last updated ${formattedUpdate(next.observedAt)}<br>Location is currently stale`
        : `<strong>${label} current location</strong><br>Last updated ${formattedUpdate(next.observedAt)}`;
      if (markers[subject].getPopup?.()) markers[subject].setPopupContent(popup);
      else markers[subject].bindPopup(popup, { maxWidth: element.clientWidth < 480 ? 220 : 300, autoPanPadding: [12, 12] });
    } else if (markers[subject]) {
      map.removeLayer(markers[subject]);
      markers[subject] = null;
    }
    if (following === subject && next.kind !== TRACKING_STATE.LIVE) following = null;
    updateButtons();
    if (advanced || (previous.kind === TRACKING_STATE.LIVE && next.kind !== TRACKING_STATE.LIVE)) {
      followFresh(true, advanced && previous.kind !== TRACKING_STATE.LIVE);
    }
    return { advanced, state: next };
  };
  paintRoute();
  initializeViewport();
  updateButtons();
  return {
    map, tileLayer,
    setRvLocation: (result) => setLocation("rv", result),
    setWillLocation: (result) => setLocation("will", result),
    setRoute(nextStops) { stops = nextStops; paintRoute(); },
    fullRoute,
    followFresh,
    getFollowing: () => following,
    getMarker: (subject) => markers[subject],
    getRvState: () => states.rv,
    getWillState: () => states.will,
    getViewMode: () => viewMode,
    isLiveFollowEnabled: () => liveFollow,
  };
}
