export const STRAVA_OPERATIONAL_WINDOWS = Object.freeze([
  Object.freeze({
    id: "ggma-2026",
    start: "2026-10-09T00:00:00-04:00",
    end: "2026-11-01T23:59:59-05:00",
  }),
]);

function timestampSeconds(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : null;
}

const compiledWindows = STRAVA_OPERATIONAL_WINDOWS.map((window) => {
  const start = timestampSeconds(window.start);
  const end = timestampSeconds(window.end);
  if (!window.id || start === null || end === null || start > end) {
    throw new Error("Invalid Strava operational window");
  }
  return { window, start, end };
});

if (compiledWindows.length !== 1) throw new Error("Exactly one Strava operational window is required");

function matchingWindow(value) {
  const timestamp = timestampSeconds(value);
  if (timestamp === null) return null;
  return compiledWindows.find(({ start, end }) => timestamp >= start && timestamp <= end)?.window || null;
}

// Gate this on the server's current time immediately before starting a Strava fetch.
export function operationalWindowAt(value) {
  return matchingWindow(value);
}

export function raceWindowStatusAt(value) {
  const window = STRAVA_OPERATIONAL_WINDOWS[0];
  return {
    raceWindowActive: operationalWindowAt(value)?.id === window.id,
    raceWindowId: window.id,
    raceWindowStart: window.start,
    raceWindowEnd: window.end,
  };
}

// Results are hidden before the attempt starts, remain visible during the
// ingest window, and remain available as historical results after it closes.
export function publicRaceResultsVisibleAt(value) {
  const timestamp = timestampSeconds(value);
  return timestamp !== null && timestamp >= compiledWindows[0].start;
}

export function canInitiateStravaActivityFetch(value) {
  return operationalWindowAt(value) !== null;
}

// Apply this separately after fetching details; webhook event_time is not the activity start.
export function operationalWindowForActivityStart(activityStartTimestamp) {
  return matchingWindow(activityStartTimestamp);
}
