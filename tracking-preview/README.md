# Isolated tracking preview

This package builds and deploys only `https://goodwingoodge.com/tracking-preview/`.
It is based on the approved Leaflet/OpenStreetMap map controls and the current
`client-preview-open-feeds` feed validation, stale-RV presentation, and content
versioning behavior.

`node tracking-preview/build.mjs` writes only
`tracking-preview/dist/tracking-preview/`. Every browser asset uses a
deterministic content-hashed filename. The HTML and `.htaccess` both set the
preview to `noindex, nofollow`; HTML revalidates while hashed assets are
immutable.

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
