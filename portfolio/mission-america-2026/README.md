# Mission America 2026 portfolio archive

This package builds the independently served historical copy at `/portfolio/mission-america-2026/` from the exact production release sources verified on 2026-11-09.

```sh
node portfolio/mission-america-2026/build.mjs
node portfolio/mission-america-2026/verify.mjs
```

The output is isolated in `portfolio/mission-america-2026/dist/`. It has its own HTML, assets, fonts, recorded public data, `.htaccess`, noindex policy, and deployment inventory. It does not use production GPS, authenticated APIs, form submissions, analytics, or recurring production polling.

The public race snapshot contains 27 recorded completed races and 23 scheduled entries. Missing activity history is intentionally not inferred.
