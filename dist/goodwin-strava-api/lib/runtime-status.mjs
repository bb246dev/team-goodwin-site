import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { STRAVA_OPERATIONAL_WINDOWS } from "./race-window.mjs";

const window = STRAVA_OPERATIONAL_WINDOWS[0];
const processStartedAt = new Date(performance.timeOrigin).toISOString();
const raceWindowModuleVersion = createHash("sha256")
  .update(JSON.stringify(STRAVA_OPERATIONAL_WINDOWS))
  .digest("hex");
const releaseGeneration = createHash("sha256")
  .update(JSON.stringify({
    schema: "goodwin-runtime-status-v1",
    pid: process.pid,
    processStartedAt,
    raceWindowModuleVersion,
  }))
  .digest("hex");

export function runtimeStatus() {
  return {
    releaseGeneration,
    pid: process.pid,
    processStartedAt,
    processUptimeSeconds: Math.floor(process.uptime()),
    raceWindowStart: window.start,
    raceWindowEnd: window.end,
    raceWindowModuleVersion,
  };
}
