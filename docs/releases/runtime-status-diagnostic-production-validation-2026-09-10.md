# Runtime-status diagnostic production validation — 2026-09-10

## Result

**PASS / COMPLETE**

The surgical runtime-status diagnostic prerequisite was deployed to the active Team Goodwin Passenger application and validated without advancing the mission-window release. The dedicated cPanel Restart produced a running process whose start time and uptime are consistent with the operator's manual restart. Because no pre-restart generation, PID, or process-start record exists, this is restart-time evidence rather than a direct before/after worker-generation comparison.

The mission-window production release remains **BLOCKED** pending separate explicit operator authorization.

## Production-baseline approach

The diagnostic candidate was constructed from the exact active production backend baseline rather than repository HEAD or a generated backend copy.

| Runtime file | Production baseline | Deployed diagnostic candidate |
| --- | --- | --- |
| `/home/goodfjcw/goodwin-node-test/app.js` | SHA-256 `078967d001e1539b44c47d96cd5deacd0cee21a213dacefe77ec2dd724de5f16`; 17,441 bytes | SHA-256 `15bf00c814a8bbbcdad876316c5e7b122b6291cfcbf78733f722042a364cc13b`; 17,483 bytes |
| `/home/goodfjcw/goodwin-node-test/lib/routes.mjs` | SHA-256 `04e01847a5ab7b5dda1081de166a65809578826f782b2abddfc8aa21aeec056d`; 16,563 bytes | SHA-256 `53772a0d2c199008e4488dd378ae736e34133eef127c0263eb4dbeec8fe0cf8a`; 16,797 bytes |
| `/home/goodfjcw/goodwin-node-test/lib/runtime-status.mjs` | Absent | SHA-256 `e0df4c3b7364eeca4c718890adc77a057f46ce6f4aa51679feadff4cdd6aa2fc`; 881 bytes |

Only those three backend files comprised the diagnostic prerequisite. No race-window candidate or frontend candidate was deployed.

## Dedicated cPanel Restart

After the operator uploaded the three diagnostic files, the operator used the dedicated **Restart** control for the cPanel Passenger application mounted at `goodwingoodge.com/strava`. No `tmp/restart.txt` substitution, application-setting change, stop/start workaround, or second restart was used for validation.

## Authenticated seven-field proof

The operator manually requested `GET /strava/admin/runtime-status` through an authenticated session. The endpoint returned HTTP `200` with exactly the seven approved fields and no additional fields:

| Field | Loaded value |
| --- | --- |
| `releaseGeneration` | `32ae7bafc33f85b5880933c8cb911db419d636cc71a826662f550b4db5ea617d` |
| `pid` | `3911101` |
| `processStartedAt` | `2026-09-10T05:39:07.634Z` |
| `processUptimeSeconds` | `1154` |
| `raceWindowStart` | `2026-10-09T00:00:00-04:00` |
| `raceWindowEnd` | `2026-11-01T23:59:59-05:00` |
| `raceWindowModuleVersion` | `011cfc7cf32ad092cda0fe95d790058741948587a84e3b8cdc2b057c8fd1232c` |

The reported uptime places the observation at approximately `2026-09-10T05:58:21.634Z`, 19 minutes 14 seconds after the reported process start. This is reasonable for the recent manual cPanel Restart and independently confirms that the running process started at the restart time. It does not establish a direct generation/PID change because no pre-restart generation/PID evidence was captured.

The running process still loaded the production midnight start, `2026-10-09T00:00:00-04:00`, and the current production end, `2026-11-01T23:59:59-05:00`. This proves the diagnostic observes the imported runtime race-window module without prematurely applying the blocked mission-window candidate.

## Authentication and security validation

- Authenticated diagnostic request: HTTP `200`.
- Anonymous diagnostic request: generic HTTP `401` with `{"error":"unauthorized"}`.
- Invalid HTTP Basic request: the same generic HTTP `401` response.
- `Cache-Control`: `no-store, private`.
- No permissive CORS response header was present.
- The successful response contained exactly the seven approved operational fields.
- No paths, configuration values, credentials, tokens, authorization headers, cookies, browser storage, database information, or other sensitive fields were returned.
- `/strava/status` and `/strava/connect` remained HTTP `401` when requested anonymously.

## Public API non-regression

- `/strava/public/races`: HTTP `200`; exactly 50 races with sequences 1–50.
- `/strava/public/race-status`: HTTP `200`; inactive pre-race state, 0 of 50 completed, with the existing midnight start and current end.
- `/strava/public/tracking-status`: HTTP `200`; HAPN tracking response available.
- Production `assets/tracker-base.js` remained SHA-256 `42ff22f91263e81529a09d2bef6f61f014eb96492ae9366a65c32654bffa6b98`.
- Production `assets/strava-race-map.mjs` remained SHA-256 `4d8b6e1b33b701651fa5219e5a12736dee5d0605ac7810fa8a1d1eb427629dae`.

The diagnostic prerequisite is therefore **PASS / COMPLETE**. The dedicated cPanel Restart is sufficient for the later mission-window validation procedure when that separate release is explicitly authorized. The mission-window `race-window.mjs`, `tracker-base.js`, and `strava-race-map.mjs` candidates remain undeployed and blocked.
