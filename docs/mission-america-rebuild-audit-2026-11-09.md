# Mission America rebuild audit — 2026-11-09

## Recovery checkpoint

- Working branch at audit start: `codex/mission-america-rebuild-2026-11-09`
- Starting commit: `fcf4bd21cecd739507df15e2e15697b2a4ef1dde`
- Recovery branch: `codex/recovery-mission-america-rebuild-2026-11-09-fcf4bd2`
- Tracked files were clean. Pre-existing untracked `.codex-*` work was deliberately excluded and left untouched.

## Requirement audit

| Requirement | Audit result | Resolution |
| --- | --- | --- |
| Preserve the current revised homepage design | Complete | The current green Goodwin design, typography, section order, copy revisions, footer, and responsive behavior remain the source of truth. |
| Confirmed record details | Complete | Central content records 50 marathon-distance runs, 50 states, 1,310 miles, 22 days 17 hours 16 minutes 34 seconds, Honolulu to New York City, and the Guinness World Records announcement dated November 6, 2026. |
| Biography and charitable purpose | Complete | The homepage and retained William page preserve Amanda’s story, the Australia and U.S. runs, and the cancer-support purpose. |
| Photography, Goodwin operations, partners, and supporters | Complete | Current homepage photography, aviation/logistics copy, full partner wall, retained athlete/supporter and partner pages are preserved. |
| Field notes and news | Partial before this pass | Retained week pages remain historical context. The Updates route now uses the captured local field-note snapshot and no longer polls Google Sheets. |
| Countdown/live/attempt/participation language | Missing before this pass | Legacy pages receive a clear mission-complete notice, retrospective disclaimers and navigation, confirmed record language where prominent, and closed-registration messaging. |
| Historical map without live polling | Complete in the portfolio archive; missing canonical production destination | `/live-tracking/` now resolves to the independent recorded archive map. The archive uses captured public data and no authenticated/live tracker polling. |
| Meaningful navigation and CTAs | Partial before this pass | Legacy map and participation links now resolve to the archive; the homepage film CTAs identify the bundled video honestly as the original campaign film. Old root hashes are mapped to current destinations. |
| Redirects and deployment boundaries | Missing before this pass | A reviewed `.htaccess` candidate preserves clean routes, redirects only the former live tracker, and explicitly exempts portfolio, tracking preview, client preview, API, and Strava namespaces. |
| Portfolio independence and cleanup protection | Complete | The archive has its own build, verification, create-only deploy workflow, noindex policy, assets, captured data, and destination allowlist. Regression checks remain in place. |

## Production URL inventory and rebuilt destinations

The clean route and matching `.html` form share the same destination unless noted.

| Existing production URL | Rebuilt destination | Content retained |
| --- | --- | --- |
| `/` | Retrospective homepage | Achievement, record, story, biography, Goodwin operation, legacy, partners, film |
| `/#the-run` | `/#story` | Mission and journey overview |
| `/#why` | `/#story` | Story and purpose |
| `/#map` | `/portfolio/mission-america-2026/live-tracking.html` | Recorded historical map |
| `/#rsvp` | `/portfolio/mission-america-2026/` | Archived event context; no active registration |
| `/the-run/` | Retained retrospective mission page | Journey and logistics overview |
| `/will/` | Retained retrospective William Goodge page | Biography, Amanda, prior endurance projects, captured photography |
| `/fifty-runs/` | Retained completed-route page | Ordered 50-state itinerary and confirmed final time |
| `/updates/` | Retained field-notes archive | Captured public updates; no polling |
| `/week-1/`, `/week-2/`, `/week-3/` | Retained historical field-note pages | Week-by-week planning and journey context |
| `/faq/` | Retained retrospective FAQ | Origin, logistics, recovery, documentation, participation history, charitable purpose |
| `/athletes/` | Retained supporter/athlete page | Mission people and profiles |
| `/partners/` | Retained partner page plus homepage partner wall | Partner and supporter recognition |
| `/live-tracking/` | 301 plus HTML fallback to the portfolio historical map | Captured route/status experience without live polling |
| `/privacy/`, `/terms/`, `/accessibility/` | Retained legal/information pages | Existing policies |
| `/participation-terms/` | Retained historical waiver with registration-closed notice | Original event terms for reference only |

## Protected independent namespaces

The retrospective redirect configuration does not rewrite or clean these paths:

- `/portfolio/mission-america-2026/` — independently built and deployed archive
- `/tracking-preview/` and `/client-preview/` — independent tracking/embed experiments
- `/strava/` — Passenger backend mount
- `/api/` — required public/static backend routes

## Later-revision conflicts retained

- The current green Goodwin theme overrides the initial blue-accent mockup direction.
- The current simplified Goodwin/Mission America header, period-free display headlines, typography system, section sizing, Guinness treatment, and live-site-style footer override earlier draft compositions.
- The current homepage remains a focused single-page retrospective. Preserved long-form material stays on retained routes rather than adding new homepage sections that would alter the approved layout.

## Unresolved or bounded facts

- The confirmed Guinness title and total elapsed time are sourced; detailed final split times and a complete per-state result ledger are not present, so the itinerary is not relabeled as verified per-race results.
- The historical map uses only captured public route/status data available in the archive. Missing tracking history is not reconstructed.
- `assets/goodge-website.mp4` is preserved and labeled as the original Mission America campaign film. No separately confirmed post-event documentary release URL is present.
- The original fundraising link is retained as historical campaign context; ongoing availability and current fundraising totals are not asserted.
