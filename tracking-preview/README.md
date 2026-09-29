# Isolated tracking preview

This package builds and deploys only `https://goodwingoodge.com/tracking-preview/`.
It contains a hash-pinned snapshot of the current production homepage, with the
production tracking stage replaced by the approved Leaflet/OpenStreetMap map
controls. Existing production images, styles, scripts, fonts, and media remain
root-relative under `/assets/` and `/fonts/`; they are never copied into or
uploaded by the preview package. The map retains the current public-feed
validation, stale-RV presentation, Live Follow behavior, and error isolation.

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


## October airport placements

All windows use local airport times and include their start but exclude their end.
Will: HNL October 9 9:11pm–11pm HST (two hours before the scheduled 11:11pm
flight), ANC October 10 2pm–3:51pm AKDT, PDX October 11 1pm–5pm PDT.
RV: PDX October 11 4am–8am PDT. Airport coordinates are approximate.
During these windows the appropriate icon uses the scheduled airport location;
public feeds continue polling normally. Outside them the latest feed position
resumes, with unavailable/stale states preserved. Estimated running windows do
not gate Strava. A one-second clock check and tab visibility refresh enforce
transitions even during feed failures. Preview and embed share the same app.
This preview branch does not yet contain the FlightAware scheduler, so these
changes do not enable flights or fill the 11pm–11:11pm HNL / 5pm–5:15pm PDX gaps.
