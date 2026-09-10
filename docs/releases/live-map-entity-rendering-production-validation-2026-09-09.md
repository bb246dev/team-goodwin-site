# Live map entity rendering production validation — 2026-09-09

## Result

**PASS / COMPLETE**

The controlled Team Goodwin live-map Micro release was deployed and validated on `https://goodwingoodge.com/`. The release changed one production file only and did not require rollback.

## Implementation and deployment scope

- Implementation commit: `f4c279c9a5e02bd4f1e3f188f285e1473ddab6bd`
- Deployed production file: `/public_html/assets/tracker-base.js`
- Unchanged map module: `/public_html/assets/strava-race-map.mjs`
- Pre-deploy rollback copy: `/private/tmp/team-goodwin-live-map-release-backup-2026-09-09/tracker-base.js.pre-f4c279c`
- Passenger was not restarted.
- No HTML, CSS, footer, Spyroll asset, topology, backend, configuration, database, `.htaccess`, credential, or security-header file was deployed.

| File | Pre-deploy SHA-256 | Post-deploy SHA-256 | Pre bytes | Post bytes |
| --- | --- | --- | ---: | ---: |
| `assets/tracker-base.js` | `570b8f8431f2202b383d5ce7b74f1027e9dd35ef66adb94a57568f2ed7c26931` | `42ff22f91263e81529a09d2bef6f61f014eb96492ae9366a65c32654bffa6b98` | 83,264 | 83,592 |
| `assets/strava-race-map.mjs` | `4d8b6e1b33b701651fa5219e5a12736dee5d0605ac7810fa8a1d1eb427629dae` | unchanged | 15,109 | 15,109 |

Cache-busted production retrieval matched the candidate byte-for-byte after upload.

## Approved rendering changes

- The user-visible map key changed from `Runner / Flight / RV` to `Will / Flight / RV`.
- Moving Will and RV markers contain images only. The current production map has no moving flight marker; its static flight paths and plane artwork remain unchanged and do not gain a label.
- No user-visible `Runner` remains in the rendered map UI.
- The RV image frame is `x=-30`, `y=-20`, `width=60`, `height=40` with `preserveAspectRatio="xMidYMid meet"`.
- The full RV artwork is visible without cropping, distortion, a new background, or an anchor change.

## Projection correction

The former live/race projection approximation used scale `1280` and translate `[480, 300]` without the topology projection's matching center offset. The corrected implementation uses the U.S. Atlas-compatible geoAlbersUsa parameters: scale `1300`, translate `[487.5, 305]`, and the matching center offset. No manual, Ohio-specific, Columbus-specific, or race-specific offset was introduced.

Deterministic displayed SVG controls:

| Control | X | Y |
| --- | ---: | ---: |
| Columbus | 739.806 | 264.544 |
| HAPN control | 739.686 | 263.812 |
| Cincinnati | 719.134 | 284.661 |
| Cleveland | 754.738 | 231.090 |
| Toledo | 727.250 | 231.867 |
| Seattle | 190.910 | 75.760 |
| Los Angeles | 181.395 | 354.545 |
| Dallas | 529.960 | 422.670 |
| Chicago | 666.633 | 233.979 |
| New York | 870.353 | 224.852 |
| Miami | 829.010 | 538.836 |

Columbus/HAPN distance: `0.742` SVG units. Ohio and nationwide relative-placement assertions passed.

## Tests and production validation

- Targeted map, projection, HAPN frontend, Strava map, Strava public API, and race-window suites: PASS (35 assertions; the localhost-backed endpoint test was rerun outside the filesystem sandbox and passed 5/5).
- `git diff --check`, staged diff checks, and staged secret scan: PASS.
- Fresh isolated Chrome production DOM: 51 states, 50 race markers, 3 core routes, 5 flight paths, Will marker present, RV marker present, START and FINISH retained.
- Map key: `Will / Flight / RV`.
- Moving marker labels: 0.
- Browser console errors: 0.
- Broken rendered images: 0.
- First-party asset checks: 47/47 healthy.
- Strava public races: healthy, 50 races.
- Strava race status: healthy and inactive pre-race.
- HAPN public tracking endpoint: healthy, sanitized stale response.
- Pre-race browser HAPN requests: 0.
- Existing race-window behavior, fallback behavior, lazy loading, camera, zoom, and pan behavior remain unchanged.

## Lightweight benchmark

Single-sample network timings:

| Measurement | Pre-deploy | Post-deploy |
| --- | ---: | ---: |
| Homepage TTFB | 0.798 s | 0.663 s |
| Homepage total | 1.017 s | 0.894 s |
| Tracker asset TTFB | 0.872 s | 0.746 s |
| Tracker asset total | 1.340 s | 1.270 s |

- Tracker size increase: 328 bytes (`0.394%`).
- Pre-deploy warmed in-app lazy render observation: 227 ms.
- Post-deploy isolated Chrome render: 2,974.5 ms cold and 1,057.2 ms warm. These browser timings have different cache contexts and are recorded as operational observations rather than a direct regression ratio.
- Post-deploy CLS: `0`; the pre-deploy map box also remained stable during its observation window.
- Map structure counts remained exactly unchanged.
- No material network, layout, or structural regression was detected.

## Explicit exclusions

The deployed production asset contains none of the local dry-run zoom/focus tooling: no Full Route, Follow RV, Street Test, automatic camera focus, previous-position marker/line, distance readout, diagnostic panel, simulated race clock, 15-second polling, local proxy/wrapper, or geographic diagnostic UI.

API #3 and `Will > Flight > RV` provider-priority logic remain deferred and were not implemented.
