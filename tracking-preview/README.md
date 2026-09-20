# Isolated tracking preview

This package builds and deploys only `https://goodwingoodge.com/tracking-preview/`.
It contains a hash-pinned snapshot of the current production homepage and its
required assets, with the production tracking stage replaced by the approved
Leaflet/OpenStreetMap map controls. The map retains the current public-feed
validation, stale-RV presentation, Live Follow behavior, and error isolation.

`node tracking-preview/build.mjs` writes only
`tracking-preview/dist/tracking-preview/`. Preview-native assets use
content-hashed filenames and production-snapshot assets use deterministic
content-version query strings. The HTML and `.htaccess` both set the preview to
`noindex, nofollow`; HTML revalidates while versioned assets are immutable.
Production analytics are removed, preview browser-storage keys are namespaced,
and unchanged non-homepage links intentionally continue to production pages.

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
