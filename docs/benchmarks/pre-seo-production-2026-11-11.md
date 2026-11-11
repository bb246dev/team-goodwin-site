# Mission America SEO release — pre-deployment production benchmark

Captured on 2026-11-11 before the SEO release from repository commit
`fc799d3`. This benchmark is the rollback and comparison baseline for the
canonical metadata, structured data, sitemap, font, responsive-image, and URL
consolidation changes in `mission-america-seo-2026-11-11.json`.

## Live production baseline

- `https://goodwingoodge.com/` returned HTTP 200 over HTTP/2.
- `https://www.goodwingoodge.com/` also returned HTTP 200 instead of
  redirecting to the canonical apex host.
- The homepage title was `Mission America | Goodwin Generated`.
- `/the-run/`, `/will/`, and `/fifty-runs/` had titles but no discoverable
  description or canonical tag.
- `/athletes/` and `/partners/` used relative `.html` canonical values.
- `robots.txt` and `sitemap.xml` returned HTTP 200. The sitemap had no
  `lastmod` values, included legal pages, and omitted athletes and partners.
- Production served the expected baseline hardening headers: HSTS, MIME
  sniffing protection, referrer policy, frame denial, and a restrictive
  permissions policy.

## Exact live document hashes

| Production object | SHA-256 before release |
| --- | --- |
| `/` | `e1f2250db76a39aab07ee3c7d04793a304de60e75403e0c5ba36d4a8fef49a44` |
| `/accessibility.html` | `512864f2ca3c65d4ab00d26cb4c029c3230d7234633631cc180e5d7964f67d21` |
| `/athletes.html` | `a6f3e408fc4f3718c325a492264c5a2742e29e206b9171e4985be128e53801c8` |
| `/faq.html` | `ad967addfdedd66c3927182189e24cb9e59727052502d36da6a48de0ee1a542e` |
| `/fifty-runs.html` | `09d5f61329ce1561e522afba35e6eb6f9e59fbd5394bffa3d8ca291aec83d03e` |
| `/participation-terms.html` | `9d9dcce2d5b957c0e37888dc4a70f21fc6cd888db4811e4abbd97380763c359e` |
| `/partners.html` | `aa3fb7289a72c36597f2fc2c8c9424ec1f22cbeae42201aebe66c95b2a51f027` |
| `/privacy.html` | `80784ef52df40ea08cb099c0f0b6737226c3257c7e20beac594bb98e1f2a236e` |
| `/terms.html` | `5eb91c9d7806d36d785f8ed7220c885bdcd9a6e45d88f6fb0fb20621d43c8bf2` |
| `/the-run.html` | `8e78fd99d8c691217fe7e10ba259327a55903353d955125c868fbb62bcabdd59` |
| `/updates.html` | `d55471e6fcae160f65109d149687a5af38f7bdd17569bc2c45b120406648e889` |
| `/week-1.html` | `8178a30b3a41d92cb912db9d9cbb2e03515833afe0a5992c943896e7e2ca8e14` |
| `/week-2.html` | `8e90be5b4cf18b2f797d5de74f565f03a67f7126106b14a4e8ed8ff826adda02` |
| `/week-3.html` | `22d37dcebab73b63ebfeae1198934a82eb0537027f6d9b6fb7f68ccbecd936ba` |
| `/will.html` | `6bc379b78718ff46a3a0b878aca15042cdd42720083aee2cdd3753b0e1896425` |
| `/assets/rebuild-homepage.css` | `6e6613c27635dec1634920978c68e960f3445996741672682e4d32d5494022a6` |
| `/fonts/inter.css` | `db54ee5d401202261cbf38e676f1842c3928f0be52bbb4ddbac8d2009e3b53a5` |
| `/fonts/offline-fonts.css` | `e247847ea8ea5dfa47c40b4e6c1ebd6cac768d6df4ab5139cf303a05832f3efe` |
| `/robots.txt` | `11e39bd839f0ea1a99e539f8ce982e02423d6dc4bf63ddd68cbaba4ebd95c8bf` |
| `/sitemap.xml` | `e9699dfea3ebe76a54b8c3798f3b214e4ad0e9e57210711a9ba84cb893b0a7d5` |

The protected `.htaccess` baseline is pinned to the previously reviewed source
hash `e8d9e687a9a6ab28f1bba3563d0d0aa845907627f2e7591e30e2231aaab76d6b`.
The controlled dry run must confirm that exact remote precondition before an
upload is permitted.

## New-path absence checks

The following paths returned HTTP 404 before release and may therefore be
created only through exact-hash, expected-absent manifest entries:

- `/favicon.ico`
- `/fonts/inter-latin.woff2`
- `/fonts/fraunces-latin.woff2`
- `/assets/rebuild/mission-america-social.jpg`
- `/assets/rebuild/mission-america-legacy-team-960.webp`
- `/assets/rebuild/mission-america-legacy-team-1600.webp`

## Release gates

- The portfolio archive, tracking preview, client preview, API, and Strava
  namespaces remain explicitly excluded from canonical redirects and cleanup.
- The manifest must pass the isolated build, secret scan, full regression
  suite, production precondition comparison, per-file upload verification, and
  live browser/API checks.
- A mismatch in any expected production hash aborts the release before upload.
