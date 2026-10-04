# Controlled HAPN API #2 production candidate

This is a minimal, unpublished patch set for the authoritative
`goodwingoodge.com` Namecheap/cPanel deployment. It is not a generated site tree
and must not be uploaded as one archive over `public_html`.

## Before any upload

1. Back up the current cPanel application `app.js` and the current production
   `/public_html/assets/tracker-base.js` and `/public_html/assets/strava-race-map.mjs`.
2. Verify the five file checksums in `manifest.json`.
3. Add the real HAPN client ID, client secret, and device IMEI only to cPanel's
   protected runtime environment or the private configuration file outside
   `public_html`. Never add them to these files or to an upload archive.
4. Keep API #3 unconfigured and unimplemented.

## Controlled upload order

Upload only the five paths in `manifest.json`, preserving their relative target
locations. Upload the server files first, restart the existing Passenger app,
and verify `GET https://goodwingoodge.com/strava/public/tracking-status` before
uploading the public module and tracker patch. Do not change production HTML,
CSS, images, fonts, security headers, HSTS, or the Strava database/migrations.

The public endpoint is GET-only and must return either `{ "available": false }`
or the minimal normalized RV projection documented in
`docs/hapn-rv-integration.md`. POST, OPTIONS, and HEAD must return 405. It must
not emit an access-control allow-origin header.

## Rollback

Restore the three backed-up existing files, remove only the two newly added HAPN
library files, restart Passenger, and purge only the changed tracker/module
cache entries. Verify the complete static map and Strava snapshot again. If any
credential exposure is suspected, revoke/rotate the HAPN credentials and device
authorization before restoring service.
