# Mobile footer hierarchy production validation — 2026-09-09

**Status:** **PASS / COMPLETE**

**Production:** <https://goodwingoodge.com>

**Implementation commit:** `0d9f9ccb4a1b19a14a1fb81b624f1379930c9493`

## Deployment scope

Exactly one production file was deployed:

- `assets/footer-social.css`

No HTML file, Passenger process, API/backend file, map asset, slideshow asset,
configuration, credential, database, `.htaccess`, or security-header setting was
changed. Passenger was not restarted.

## Integrity

| Production file | Before SHA-256 | After SHA-256 |
|---|---|---|
| `assets/footer-social.css` | `9463e76c0df4222121f73714948a54ee5ae1e4ba42e67b6954252179c19c6659` | `dbbd76a2765a3d40dd131a901ec30b5d75a0df60ea2abf28e8abcb2c7b925ccb` |

The deployed stylesheet is 7,922 bytes and matched the validated candidate
byte-for-byte after upload. The previous 7,571-byte production stylesheet was
retained as the rollback artifact before deployment.

Preservation hashes remained unchanged:

| Preserved asset | SHA-256 |
|---|---|
| `assets/tracker-base.js` | `570b8f8431f2202b383d5ce7b74f1027e9dd35ef66adb94a57568f2ed7c26931` |
| `assets/strava-race-map.mjs` | `4d8b6e1b33b701651fa5219e5a12736dee5d0605ac7810fa8a1d1eb427629dae` |

## Responsive production acceptance

Fresh profiles validated all 16 clean production routes at 375×812, 390×844,
430×932, 768×900, 1024×900, and 1440×900. All 96 cases passed.

On mobile:

- the GOODWIN logo is centered;
- the centered 2×2 primary navigation is the first content row;
- the approved centered 1px translucent divider follows the navigation;
- the centered WILL GOODGE / GOODWIN social columns follow the divider;
- all six social icons are visible with 20px icons and at least 44×44px targets;
- `WilliamGoodge.com` and `TeamGoodwin.com` each remain on one line; and
- no horizontal overflow, clipping, overlap, console error, broken image, or
  unexpected first-party failure was observed.

The 768px, 1024px, and 1440px tablet/desktop layouts remained unchanged because
the release is scoped to the existing `max-width: 640px` media query.

## Slideshow, map, and APIs

- Mobile slideshow: healthy; all five production frames and the logo loaded.
- Map: 51 state shapes, 50 race markers, 3 core routes, 5 flight paths, runner
  visible, and RV visible.
- Pre-race HAPN frontend requests: zero.
- Strava races: HTTP 200 with 50 races.
- Race status: HTTP 200 and inactive pre-race.
- HAPN tracking status: HTTP 200 with its sanitized public projection.

## Tests and benchmark

- Full Node.js 22.23.2 suite: 145/145 passed.
- Local browser matrix: 96/96 passed.
- Production browser matrix: 96/96 passed.
- Root and Strava/HAPN dependency audits: zero vulnerabilities.
- Staged secret scan and `git diff --check`: passed.
- Benchmark comparison: no material page, map, transfer, or CLS regression.

Full measurements are recorded in
`docs/benchmarks/pre-mobile-footer-divider-production-2026-09-09.md` and
`docs/benchmarks/post-mobile-footer-divider-production-2026-09-09.md`.

## Rollback

If a later issue is attributed specifically to this release, restore only the
preserved pre-deployment `assets/footer-social.css` with SHA-256
`9463e76c0df4222121f73714948a54ee5ae1e4ba42e67b6954252179c19c6659`.
Do not change HTML, tracker/map assets, APIs, Passenger, configuration, database,
or security headers.

## Conclusion

The complete approved mobile footer hierarchy release is deployed and validated
as **PASS / COMPLETE**. No rollback was required.
