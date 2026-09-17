# Isolated client preview

## Baseline recorded 2026-09-17

- Clean GitHub `main` commit: `58af2608e24629973e7cf8a694d63cd2840c04e0`.
- Branch: `client-preview-open-feeds`.
- Production static root: `/home/goodfjcw/public_html` on Namecheap/LiteSpeed. Static assets are under `/assets` and `/fonts`; clean routes are root HTML files. The manual `.github/workflows/deploy-static-production.yml` uses an exact manifest and FTPS. It does not deploy this preview.
- Production backend: Passenger application root `/home/goodfjcw/goodwin-node-test`, mounted at `/strava`. The manual backend deploy and verify workflows have their own release manifest and restart/verification gate. The preview does not upload backend files or change API responses.
- RV frontend gate: `hapnLivePositioningEnabled` in the production map module requires an API sourced race status, `active: true`, the expected window metadata, and the current time inside the window. The production tracker starts its RV poller only when this gate passes; stale RV readings fall back.
- Will/Strava gate: the public race endpoint returns `active: false` until the operational window. The production tracker starts recurring race polling only when that status is active. The backend `strava-app/lib/race-window.mjs` independently gates Strava activity fetching to 2026-10-09 through 2026-11-01.
- Live public responses when inspected: race status `active: false`, 0/50 complete; RV reading `available: true, stale: true`. The preview shows waiting/stale states without placing those coordinates on the map.

## Source and deployment boundary

The current deployed HTML and CSS are not present as a complete production bundle in `main`'s `dist`. The public HTML in `preview/source` is a snapshot of the 16 live public routes captured on 2026-09-17. The production tracker and Strava map scripts are taken from the exact live-matching files already in `main` under `production-merge/mission-window-alignment-2026-09-09`; their hashes matched the public deployed scripts during baseline inspection. This keeps the preview anchored to the current `main` code and current live visual content.

`node preview/build.mjs` writes only `preview/dist`. The preview scripts are transformed copies confined to `/client-preview/assets/`; production `/assets` and all backend paths are untouched. Public styling, fonts, images and video are read from existing production asset URLs. Public Strava/HAPN endpoints are fetched directly in read-only mode; no secret is sent to the browser. The preview's noindex meta tags and local `.htaccess` do not alter production canonical URLs, sitemap or navigation. Analytics scripts are stripped from every preview page. All forms, RSVP and donation actions are blocked in the preview.

`.github/workflows/deploy-client-preview.yml` runs only from the dedicated branch and uploads an exact list of files under `public_html/client-preview/`. It verifies the preview and compares the production homepage hash before and after. It does not run the production deployment workflows and does not modify GitHub `main`.

Local check: `node preview/build.mjs && node --test preview/preview.test.mjs`.
