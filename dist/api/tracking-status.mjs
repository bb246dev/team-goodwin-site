import { publicFlightStatus } from "./flight-tracking-core.mjs";

const ROUTE_STOPS = [
  { n: 1, state: "Hawaii", city: "Honolulu", lat: 21.3099, lng: -157.8581 },
  { n: 2, state: "Alaska", city: "Anchorage", lat: 61.2181, lng: -149.9003 },
  { n: 3, state: "Oregon", city: "Portland", lat: 45.5152, lng: -122.6784 },
  { n: 4, state: "Washington", city: "Vancouver", lat: 45.6387, lng: -122.6615 },
  { n: 5, state: "Utah", city: "Salt Lake City", lat: 40.7608, lng: -111.891 },
  { n: 6, state: "Idaho", city: "Idaho Falls", lat: 43.4917, lng: -112.0339 },
  { n: 7, state: "Montana", city: "Bozeman", lat: 45.677, lng: -111.0429 },
  { n: 8, state: "North Dakota", city: "Bowman", lat: 46.1828, lng: -103.3946 },
  { n: 9, state: "South Dakota", city: "Keystone", lat: 43.8919, lng: -103.4288 },
  { n: 10, state: "Wyoming", city: "Sundance", lat: 44.4061, lng: -104.3752 },
  { n: 11, state: "Nebraska", city: "Morrill", lat: 41.9636, lng: -103.9249 },
  { n: 12, state: "Colorado", city: "Denver", lat: 39.7392, lng: -104.9903 },
  { n: 13, state: "New Mexico", city: "Albuquerque", lat: 35.0844, lng: -106.6504 },
  { n: 14, state: "Texas", city: "Dallas", lat: 32.7767, lng: -96.797 },
  { n: 15, state: "Oklahoma", city: "Afton", lat: 36.6928, lng: -94.9613 },
  { n: 16, state: "Kansas", city: "Kansas City", lat: 39.1142, lng: -94.6275 },
  { n: 17, state: "Missouri", city: "Kansas City", lat: 39.0997, lng: -94.5786 },
  { n: 18, state: "Minnesota", city: "Minneapolis", lat: 44.9778, lng: -93.265 },
  { n: 19, state: "Iowa", city: "Lansing", lat: 43.2406, lng: -91.2046 },
  { n: 20, state: "Wisconsin", city: "De Soto", lat: 43.4239, lng: -91.1971 },
  { n: 21, state: "Illinois", city: "Chicago", lat: 41.8781, lng: -87.6298 },
  { n: 22, state: "Indiana", city: "South Bend", lat: 41.6764, lng: -86.252 },
  { n: 23, state: "Michigan", city: "Sturgis", lat: 41.7992, lng: -85.4194 },
  { n: 24, state: "Ohio", city: "Columbus", lat: 39.9612, lng: -82.9988 },
  { n: 25, state: "Arizona", city: "Willow Beach / Hoover Dam", lat: 35.8755, lng: -114.6608 },
  { n: 26, state: "California", city: "Los Angeles", lat: 34.0522, lng: -118.2437 },
  { n: 27, state: "Nevada", city: "Las Vegas", lat: 36.1699, lng: -115.1398 },
  { n: 28, state: "Arkansas", city: "Little Rock", lat: 34.7465, lng: -92.2896 },
  { n: 29, state: "Louisiana", city: "Shreveport", lat: 32.5252, lng: -93.7502 },
  { n: 30, state: "Mississippi", city: "Meridian", lat: 32.3643, lng: -88.7037 },
  { n: 31, state: "Alabama", city: "Tuscaloosa", lat: 33.2098, lng: -87.5692 },
  { n: 32, state: "Florida", city: "Miami", lat: 25.7617, lng: -80.1918 },
  { n: 33, state: "Georgia", city: "Atlanta", lat: 33.749, lng: -84.388 },
  { n: 34, state: "South Carolina", city: "Greenville", lat: 34.8526, lng: -82.394 },
  { n: 35, state: "North Carolina", city: "Asheville", lat: 35.5951, lng: -82.5515 },
  { n: 36, state: "Tennessee", city: "Pigeon Forge", lat: 35.7884, lng: -83.5543 },
  { n: 37, state: "Virginia", city: "Norton", lat: 36.9337, lng: -82.629 },
  { n: 38, state: "Kentucky", city: "Pikeville", lat: 37.4793, lng: -82.5187 },
  { n: 39, state: "West Virginia", city: "Hazelton", lat: 39.6534, lng: -79.6584 },
  { n: 40, state: "Maryland", city: "Elkton", lat: 39.6068, lng: -75.8332 },
  { n: 41, state: "Delaware", city: "Glasgow", lat: 39.601, lng: -75.7466 },
  { n: 42, state: "Pennsylvania", city: "Philadelphia", lat: 39.9526, lng: -75.1652 },
  { n: 43, state: "New Jersey", city: "Teterboro", lat: 40.8576, lng: -74.0608 },
  { n: 44, state: "Connecticut", city: "Stamford", lat: 41.0534, lng: -73.5387 },
  { n: 45, state: "Rhode Island", city: "Providence", lat: 41.824, lng: -71.4128 },
  { n: 46, state: "Massachusetts", city: "Boston", lat: 42.3601, lng: -71.0589 },
  { n: 47, state: "Vermont", city: "Brattleboro", lat: 42.8509, lng: -72.5579 },
  { n: 48, state: "New Hampshire", city: "Portsmouth", lat: 43.0718, lng: -70.7626 },
  { n: 49, state: "Maine", city: "Kittery", lat: 43.0895, lng: -70.7448 },
  { n: 50, state: "New York", city: "New York City", lat: 40.7128, lng: -74.006 },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeMockTrackingStatus(progressInput) {
  const progress = clamp(Number.isFinite(progressInput) ? progressInput : ((Date.now() / 900000) % 1), 0, 1);
  const routePosition = progress * (ROUTE_STOPS.length - 1);
  const index = Math.min(ROUTE_STOPS.length - 2, Math.floor(routePosition));
  const segmentProgress = routePosition - index;
  const start = ROUTE_STOPS[index];
  const end = ROUTE_STOPS[index + 1];
  const milesToday = 4 + (segmentProgress * 22.2);
  const movingMinutes = Math.round(milesToday * 8.7);

  return {
    source: "mock",
    mode: "simulated",
    updatedAt: new Date().toISOString(),
    progress,
    location: {
      city: start.city,
      state: start.state,
      lat: Number((start.lat + (end.lat - start.lat) * segmentProgress).toFixed(5)),
      lng: Number((start.lng + (end.lng - start.lng) * segmentProgress).toFixed(5)),
    },
    activity: {
      name: `Goodwin Generated Mission America mock run ${String(start.n).padStart(2, "0")}`,
      distanceMiles: Number(milesToday.toFixed(1)),
      movingTime: `${Math.floor(movingMinutes / 60)}h ${String(movingMinutes % 60).padStart(2, "0")}m`,
      averagePace: "8:42/mi",
      elapsedTime: `${Math.floor((movingMinutes + 14) / 60)}h ${String((movingMinutes + 14) % 60).padStart(2, "0")}m`,
    },
    flightStatus: publicFlightStatus(),
  };
}

export function mockTrackingStatusFromUrl(url, env = {}) {
  const { searchParams } = new URL(url, "https://example.com");
  const pinnedProgress = Number(searchParams.get("progress"));
  const status = makeMockTrackingStatus(Number.isFinite(pinnedProgress) ? pinnedProgress : undefined);
  status.flightStatus = publicFlightStatus({
    now: searchParams.get("now") || new Date(),
    env,
  });
  return status;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-cache");
  response.status(200).json(mockTrackingStatusFromUrl(request.url));
}

export async function onRequestGet({ request, env }) {
  return Response.json(mockTrackingStatusFromUrl(request.url, env), {
    headers: {
      "Cache-Control": "no-cache",
    },
  });
}
