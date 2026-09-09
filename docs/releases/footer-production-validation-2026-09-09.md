# Footer production validation — 2026-09-09

Final status: **PASS / COMPLETE**

Production origin: `https://goodwingoodge.com/`

Deployed commit: `130b6dc2e5b5ad6fd7ca99c862badc9733ade969` (`fix: restore and refine responsive site footer`)

## Production route ownership

Production `.htaccess` maps clean page routes to root-level HTML files. The release therefore used the following authoritative route-to-file mapping:

| Public route | Production file |
|---|---|
| `/` | `index.html` |
| `/accessibility/` | `accessibility.html` |
| `/athletes/` | `athletes.html` |
| `/faq/` | `faq.html` |
| `/fifty-runs/` | `fifty-runs.html` |
| `/live-tracking/` | `live-tracking.html` |
| `/participation-terms/` | `participation-terms.html` |
| `/partners/` | `partners.html` |
| `/privacy/` | `privacy.html` |
| `/terms/` | `terms.html` |
| `/the-run/` | `the-run.html` |
| `/updates/` | `updates.html` |
| `/week-1/` | `week-1.html` |
| `/week-2/` | `week-2.html` |
| `/week-3/` | `week-3.html` |
| `/will/` | `will.html` |

Nested `*/index.html` copies were not deployed. They are not the files serving the clean routes listed above.

## Exact deployment scope

The production release changed exactly 17 paths:

- 16 root-level HTML files listed in the route-ownership table
- `assets/footer-social.css`

The production responses for all 16 clean routes and the stylesheet matched the approved deployment manifest byte-for-byte after deployment. The uploaded release ZIP was removed from `public_html` after verification.

## Production acceptance

- Desktop footer: PASS
- Centered mobile footer: PASS
- Six visible social icons: PASS
- Will Goodge YouTube: `https://www.youtube.com/@goodge`
- Goodwin YouTube: `https://www.youtube.com/@goodwinsoftwarecompany`
- `WilliamGoodge.com`: one line
- `TeamGoodwin.com`: one line
- Mobile slideshow: PASS; all five intro images loaded
- Horizontal overflow, clipping, and overlap: none
- Console errors: 0
- Broken images: 0
- Unexpected first-party failures: 0

Fresh-profile validation covered all 16 clean routes at 375×812, 390×844, 430×932, 768×900, 1024×900, and 1440×900. All 96 route/viewport checks passed.

## Map and API regression result

- 51 state shapes
- 50 race markers
- 3 core routes
- 5 flight paths
- Runner visible
- RV visible
- Pre-race HAPN frontend requests: 0
- `GET /strava/public/races`: HTTP 200
- `GET /strava/public/race-status`: HTTP 200
- `GET /strava/public/tracking-status`: HTTP 200 with a sanitized public projection
- Race status: inactive; 0 of 50 races completed

`GET /strava/health` remains HTTP 404. This is a pre-existing routing/version-parity issue recorded before the release. It is unrelated to the footer deployment and is not classified as a footer regression.

## Performance

The post-release benchmark is recorded in `docs/benchmarks/post-footer-production-2026-09-09.md`.

- Median page TTFB: 272 ms → 272 ms
- Median page total: 272 ms → 274 ms
- Homepage total: 289 ms → 295 ms
- Homepage transfer: 1,196,949 B → 1,198,563 B
- Static map render: 2,458 ms → 2,540 ms
- CLS: 0.0006904 → 0.0006904

Result: no material page or map regression. The small increase is consistent with one additional footer stylesheet; CLS was unchanged.

## Deployment and rollback history

1. The first release attempt used nested route files and was rolled back after validation showed that production clean routes resolve to root-level `.html` files.
2. Route-to-file ownership was established from production rewrite rules and byte comparisons of every clean route.
3. A corrected package containing the 16 authoritative root-level HTML files and the footer stylesheet was prepared and validated.
4. During the final release, one transfer stopped after only the stylesheet had been uploaded. That partial state was fully rolled back.
5. The release was retried in smaller ordered batches, with the stylesheet first and `index.html` last.
6. All 17 final production files matched the manifest byte-for-byte, preservation guards passed, and the uploaded ZIP was removed.
7. Rollback was not required after the successful final retry.

This is closed operational history, not an unresolved production incident.

## Security and integrity

The deployment did not modify:

- `assets/tracker-base.js`
- `assets/strava-race-map.mjs`
- the Strava backend
- the HAPN backend
- `.htaccess`
- credentials or private configuration
- the database
- map assets
- intro assets
- HSTS or other security headers

Verified production frontend hashes:

| File | SHA-256 |
|---|---|
| `assets/tracker-base.js` | `570b8f8431f2202b383d5ce7b74f1027e9dd35ef66adb94a57568f2ed7c26931` |
| `assets/strava-race-map.mjs` | `4d8b6e1b33b701651fa5219e5a12736dee5d0605ac7810fa8a1d1eb427629dae` |

## Rollback artifacts

- `goodwin-footer-production-backup-2026-09-09.zip` — verified backup for the earlier nested-file release set
- `goodwin-footer-production-root-routes-backup-2026-09-09.zip` — verified backup for the 16 authoritative root-route HTML files
- `goodwin-footer-controlled-upload-root-routes-2026-09-09-rollback.txt` — corrected release rollback list

The corrected rollback procedure is to restore the 16 root-level HTML files from the root-route backup and remove `assets/footer-social.css`. Tracker, map, API, backend, configuration, database, and security files must remain untouched.

## Current known issue

- `/strava/health` returns HTTP 404 because of the pre-existing production routing/version-parity state. Public Strava race endpoints and the HAPN tracking endpoint remain healthy. This issue is outside the completed footer release scope.

## Conclusion

The corrected root-route footer release is fully deployed, production-validated, and recorded as **PASS / COMPLETE**.
