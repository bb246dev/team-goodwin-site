import assert from "node:assert/strict";
import test from "node:test";

import {
  captureLosAngelesDepartureOrigin,
  handleStravaRequest,
  LOS_ANGELES_DEPARTURE_CAPTURE_AT,
} from "../strava-app/lib/routes.mjs";
import { createMemoryStravaStore } from "./helpers/memory-strava-store.mjs";

const adminToken = "test-only-journey-administrator-token-000000";
const auth = `Basic ${Buffer.from(`strava:${adminToken}`).toString("base64")}`;

function route(store, path, {
  now = Math.floor(Date.parse("2026-10-22T12:00:00Z") / 1000),
  method = "GET",
  authorization = null,
  body = null,
  contentType = null,
  fetchImpl,
} = {}) {
  const headers = {};
  if (authorization) headers.Authorization = authorization;
  if (contentType) headers["Content-Type"] = contentType;
  if (method === "POST") headers.Origin = "https://goodwingoodge.com";
  return handleStravaRequest(new Request(`https://goodwingoodge.com/api/strava/${path}`, {
    method, headers, body,
  }), {
    STRAVA_ADMIN_TOKEN: adminToken,
    STRAVA_STORE: store,
  }, {
    now: () => now,
    fetchImpl,
    clientAddress: "127.0.0.1",
    logger: { info() {} },
  });
}

test("public journey state exposes only explicit shared transitions and the captured origin", async () => {
  const store = createMemoryStravaStore(() => 0);
  await store.recordJourneyEvent("los-angeles-departure-origin", LOS_ANGELES_DEPARTURE_CAPTURE_AT, {
    sourceObservedAt: LOS_ANGELES_DEPARTURE_CAPTURE_AT - 30,
    position: { lat: 34.0412, lng: -118.2521 },
  });
  const response = await route(store, "public/journey-state");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    active: true,
    transitions: {
      "las-vegas-race-finished": null,
      "arizona-race-finished": null,
      "miami-race-finished": null,
    },
    origins: {
      "los-angeles-departure": {
        capturedAt: new Date(LOS_ANGELES_DEPARTURE_CAPTURE_AT * 1000).toISOString(),
        observedAt: new Date((LOS_ANGELES_DEPARTURE_CAPTURE_AT - 30) * 1000).toISOString(),
        position: { lat: 34.0412, lng: -118.2521 },
      },
    },
  });
});

test("journey controls require existing authentication and preview the exact phase before apply", async () => {
  const store = createMemoryStravaStore(() => 0);
  const unauthorized = await route(store, "journey-control");
  assert.equal(unauthorized.status, 401);

  const page = await route(store, "journey-control", { authorization: auth });
  assert.equal(page.status, 200);
  const initialHtml = await page.text();
  assert.match(initialHtml, /Mission journey controls/);
  assert.match(initialHtml, /Preview selected phase/);
  assert.doesNotMatch(initialHtml, /Apply selected transition/);

  const preview = await route(store, "journey-control", {
    authorization: auth,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: new URLSearchParams({ action: "preview", transitionId: "las-vegas-race-finished" }).toString(),
  });
  assert.equal(preview.status, 200);
  const previewHtml = await preview.text();
  assert.match(previewHtml, /Selected phase/);
  assert.match(previewHtml, /Las Vegas race finished → drive to Willow Beach \/ Hoover Dam/);
  assert.match(previewHtml, /drive-las-vegas-to-arizona/);
  assert.match(previewHtml, /Apply selected transition/);
});

test("applying an explicit transition is server-shared and repeat submissions preserve its timestamp", async () => {
  const store = createMemoryStravaStore(() => 0);
  const firstNow = Math.floor(Date.parse("2026-10-21T12:34:56-07:00") / 1000);
  const post = (now) => route(store, "journey-control", {
    now,
    authorization: auth,
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      action: "apply",
      transitionId: "las-vegas-race-finished",
      confirmTransitionId: "las-vegas-race-finished",
    }),
  });
  const applied = await post(firstNow);
  assert.equal(applied.status, 200);
  const first = await applied.json();
  assert.equal(first.applied, true);
  assert.equal(first.idempotentReplay, false);
  assert.equal(first.transition.occurredAt, new Date(firstNow * 1000).toISOString());

  const replay = await post(firstNow + 600);
  assert.equal(replay.status, 200);
  const second = await replay.json();
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.transition.occurredAt, first.transition.occurredAt);
  assert.equal(store.inspectJourneyEvents().length, 1);

  const shared = await route(store, "public/journey-state", { now: firstNow + 900 });
  assert.equal((await shared.json()).transitions["las-vegas-race-finished"].occurredAt, first.transition.occurredAt);
});

test("unknown phase IDs and unconfirmed apply requests fail closed", async () => {
  const store = createMemoryStravaStore(() => 0);
  for (const body of [
    { action: "preview", transitionId: "race-26" },
    { action: "apply", transitionId: "arizona-race-finished", confirmTransitionId: "las-vegas-race-finished" },
  ]) {
    const response = await route(store, "journey-control", {
      authorization: auth,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal(store.inspectJourneyEvents().length, 0);
  }
});

test("Los Angeles departure captures one valid local Garmin fix and never moves it later", async () => {
  const store = createMemoryStravaStore(() => 0);
  const observed = LOS_ANGELES_DEPARTURE_CAPTURE_AT - 15;
  const loader = `<?xml version="1.0"?><kml><NetworkLink><Link><href>https://abc-share.explore.garmin.com/Feed/Share/missionamerica</href></Link></NetworkLink></kml>`;
  const feed = `<?xml version="1.0"?><kml><Placemark><ExtendedData><Data name="Valid GPS Fix"><value>true</value></Data></ExtendedData><TimeStamp><when>${new Date(observed * 1000).toISOString()}</when></TimeStamp><Point><coordinates>-118.255,34.045,0</coordinates></Point></Placemark></kml>`;
  let calls = 0;
  const fetchImpl = async () => new Response(calls++ === 0 ? loader : feed, { status: 200 });
  const first = await captureLosAngelesDepartureOrigin(store, {
    now: () => LOS_ANGELES_DEPARTURE_CAPTURE_AT + 10,
    fetchImpl,
  });
  assert.deepEqual(first.position, { lat: 34.045, lng: -118.255 });
  assert.equal(first.occurredAt, LOS_ANGELES_DEPARTURE_CAPTURE_AT);
  assert.equal(calls, 2);

  const second = await captureLosAngelesDepartureOrigin(store, {
    now: () => LOS_ANGELES_DEPARTURE_CAPTURE_AT + 600,
    fetchImpl: async () => { throw new Error("must not refetch after capture"); },
  });
  assert.deepEqual(second, first);
  assert.equal(store.inspectJourneyEvents().length, 1);
});

test("a delayed capture retry never substitutes a post-departure Garmin point", async () => {
  const store = createMemoryStravaStore(() => 0);
  const before = LOS_ANGELES_DEPARTURE_CAPTURE_AT - 20;
  const after = LOS_ANGELES_DEPARTURE_CAPTURE_AT + 60;
  const placemark = (observed, lng, lat) => `<Placemark><ExtendedData><Data name="Valid GPS Fix"><value>true</value></Data></ExtendedData><TimeStamp><when>${new Date(observed * 1000).toISOString()}</when></TimeStamp><Point><coordinates>${lng},${lat},0</coordinates></Point></Placemark>`;
  const loader = `<?xml version="1.0"?><kml><NetworkLink><Link><href>https://abc-share.explore.garmin.com/Feed/Share/missionamerica</href></Link></NetworkLink></kml>`;
  const feed = `<?xml version="1.0"?><kml>${placemark(before, -118.25, 34.04)}${placemark(after, -118.20, 34.08)}</kml>`;
  let calls = 0;
  const captured = await captureLosAngelesDepartureOrigin(store, {
    now: () => LOS_ANGELES_DEPARTURE_CAPTURE_AT + 120,
    fetchImpl: async () => new Response(calls++ === 0 ? loader : feed, { status: 200 }),
  });
  assert.equal(captured.sourceObservedAt, before);
  assert.deepEqual(captured.position, { lat: 34.04, lng: -118.25 });
});
