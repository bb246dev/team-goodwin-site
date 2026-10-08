# Isolated tracking preview

This package builds and deploys only `https://goodwingoodge.com/tracking-preview/`.
It contains a hash-pinned snapshot of the current production homepage, with the
production tracking stage replaced by the approved Leaflet/OpenStreetMap map
controls. Existing production images, styles, scripts, fonts, and media remain
root-relative under `/assets/` and `/fonts/`; they are never copied into or
uploaded by the preview package. The map retains the current public-feed
validation, stale-RV presentation, Live Follow behavior, and error isolation.

The full preview at `/tracking-preview/` and its iframe-safe `/embed/` route are
the isolated Garmin trial. Their runner marker and trail use the public Garmin KML loader at
`https://share.garmin.com/Feed/ShareLoader/missionamerica`, follow the validated
NetworkLink, and poll no sooner than every 120 seconds. A same-origin,
allowlisted PHP proxy at `/tracking-preview/garmin-feed.php` avoids Garmin's
missing browser CORS header and caches upstream responses for at least 120
seconds. Empty, stale, malformed, and unavailable KML degrade to explicit
last-known or unavailable states. Strava is not requested for the preview runner
layer; RV and flight route layers are unchanged.

The separate iframe-safe `/inreach-iii/` route is a Garmin-only map labeled
`inReach III`. It reads the public
`https://aus-share.explore.garmin.com/Feed/Share/missionamerica50` KML through
the same allowlisted, 120-second server cache and does not request or render the
RV feed. The map permits manual zoom through level 17; Auto Follow is capped at
level 10.

`node tracking-preview/build.mjs` writes only
`tracking-preview/dist/tracking-preview/`. Only preview-native assets are
written beneath its `assets/` directory, using content-hashed filenames. Any
`site/` output or `/tracking-preview/site/` URL is prohibited by regression and
deployment checks. The HTML and `.htaccess` both set the preview to `noindex,
nofollow`; HTML revalidates while versioned preview assets are immutable.
Production analytics are removed and unchanged non-homepage links intentionally
continue to production pages.

`tracking-preview/deploy.mjs` runs only on
`codex/tracking-preview-leaflet`, compares its exact build inventory to the
manifest, and rejects any source or destination outside
`public_html/tracking-preview/`. It does not delete or upload production files,
backend files, or `/client-preview/` files.

Local preflight:

```sh
node tracking-preview/build.mjs
node --test tracking-preview/tracking-preview.test.mjs
```

Local watchable preview (including the same-origin Garmin proxy):

```sh
node tracking-preview/dev-server.mjs
```

The local server binds only to `127.0.0.1`. It serves preview files locally and
reads any production assets absent from the checkout from `goodwingoodge.com`;
it never writes to production.


## October airport placements

All windows use local airport times and include their start but exclude their end.
Will: HNL October 9 9:11pm–11pm HST (two hours before the scheduled 11:11pm
flight), ANC October 10 2pm–3:51pm AKDT, PDX October 11 1pm–5pm PDT.
RV: PDX October 11 4am–8am PDT. Airport coordinates are approximate.
During these windows the RV icon uses its scheduled airport location;
public feeds continue polling normally. Outside them the latest feed position
resumes, with unavailable/stale states preserved. A one-second clock check and tab visibility refresh enforce
transitions even during feed failures. Preview and embed share the same app.
This preview branch does not yet contain the FlightAware scheduler, so these
changes do not enable flights or fill the 11pm–11:11pm HNL / 5pm–5:15pm PDX gaps.
Both Garmin-configured preview surfaces intentionally bypass scheduled Will
airport overrides so the runner marker always reflects Garmin; RV placements
remain unchanged. Auto Follow targets the runner, preserves a user's manual zoom
while recentering, and supports Leaflet zoom level 10 (with a configured maximum
of 17).
