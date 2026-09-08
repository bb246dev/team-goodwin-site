# TG-M02 — Browser security headers and CSP Report-Only preparation

**Assessment date:** 2026-09-07  
**Production target:** `https://goodwingoodge.com`  
**Hosting:** Namecheap shared hosting / cPanel / LiteSpeed, with a Passenger Node application mounted at `/strava`  
**Authoritative audit:** `docs/security/cis-owasp-audit-2026-09-07.md`  
**Preparation status:** **PASS — Stage A is ready for a separately approved deployment; CSP enforcement is not approved or ready**  
**Change status:** **Documentation only. No production, `.htaccess`, HSTS, runtime, cPanel, DNS, database, or GitHub change was made.**

## Identifier note

The user-authorized name for this phase is **TG-M02**. The authoritative audit
already uses `TG-M02` for the closed public-asset/indexing cleanup and labels
the browser-header finding `TG-M04`, with CSP trust-boundary dependencies also
tracked under `TG-M08`. This record therefore means **TG-M02 browser-header
phase (audit finding TG-M04; related TG-M08)**. It does not reopen or replace
the closed asset-cleanup record.

## Decision

The smallest safe first improvement is a host-scoped, static-surface-only set
of four non-CSP headers:

```http
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
```

Deploy CSP separately and only as `Content-Security-Policy-Report-Only`. The
initial policy must allow the exact current browser dependencies and must not
be promoted to enforcement until violations have been observed and resolved.
The existing host-only HSTS policy remains exactly `max-age=86400` and is out
of scope.

## Scope and methods

This preparation used low-volume unauthenticated HTTPS requests, source and
deployment-tree review, a fresh-profile headless Chromium network log, and a
hidden in-app-browser DOM/console inspection. It reviewed all user-specified
responses and the additional public templates linked from them. It did not
authenticate, submit forms, mutate production, inspect the live `.htaccess`,
or exercise OAuth/webhook side effects.

The production root `.htaccess` is not tracked and was not read. Any future
deployment must first download a private rollback copy and inspect the live
file around the existing HSTS, rewrite, Passenger, cache, compression, and
security directives.

## 1. Current production header inventory

Every sampled HTTPS response contained exactly one:

```http
Strict-Transport-Security: max-age=86400
```

No HSTS change is proposed. `Content-Security-Policy-Report-Only`,
`X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and
`Cross-Origin-Resource-Policy` were absent from every sampled response.

| Response | Status/type | CSP | `nosniff` | Referrer | Other requested headers |
| --- | --- | --- | --- | --- | --- |
| `/` | `200 text/html` | Missing | Missing | Missing | Missing |
| `/the-run/` | `200 text/html` | Missing | Missing | Missing | Missing |
| `/will/` | `200 text/html` | Missing | Missing | Missing | Missing |
| `/fifty-runs/` | `200 text/html` | Missing | Missing | Missing | Missing |
| `/live-tracking/` | `200 text/html` | Missing | Missing | Missing | Missing |
| `/assets/tracker-base.js` | `200 text/javascript` | Missing | Missing | Missing | Missing |
| `/assets/strava-race-map.mjs` | `200 text/javascript` | Missing | Missing | Missing | Missing |
| `/strava/health` | `200 application/json` | Enforced `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` | Present | `no-referrer` | Missing |
| `/strava/public/races` | `200 application/json` | Same enforced policy | Present | `no-referrer` | Missing |
| `/strava/public/race-status` | `200 application/json` | Same enforced policy | Present | `no-referrer` | Missing |
| Static `/tg-m02-header-check-not-found` | `404 text/html` | Missing | Missing | Missing | Missing |
| Passenger `/strava/tg-m02-header-check-not-found` | `404 application/json` | Same enforced policy | Present | `no-referrer` | Missing |

Additional boundary evidence:

- `/assets/` returned `403 text/html` with HSTS but none of the proposed
  static headers.
- Unauthenticated `/strava/status` returned `401 application/json` with the
  Passenger CSP, `no-referrer`, and `nosniff` headers.
- Static HTML uses `Cache-Control: no-cache, must-revalidate`; active scripts
  use a seven-day public cache; static 403/404 responses use a private
  no-store/no-cache policy. The Strava application's existing endpoint-specific
  cache policies remained intact.
- `strava-app/app.js` and `strava-app/lib/routes.mjs` independently confirm
  that the Passenger application generates its current enforced CSP,
  `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.

## 2. Actual browser resource requirements

### Observed production origins

| Resource class | Required source | Evidence and use |
| --- | --- | --- |
| Scripts/modules | `'self'` | Tracker, ambient scripts, map module, and local bundles |
| Scripts | `https://www.googletagmanager.com` | Production `gtag.js` loader |
| Scripts/JSONP | `https://docs.google.com` | Active Google Sheets GViz JSONP updates feed |
| Fetch/XHR/import | `'self'` | Map topology, `/strava/public/races`, `/strava/public/race-status`, optional same-origin Instagram route, dynamic map import |
| Analytics connect/beacon | `https://www.google-analytics.com` | Fresh Chromium network log observed `g/collect` |
| Styles | `'self'` plus inline | Local stylesheets, per-template style blocks, dynamic style attributes |
| Images | `'self'` and `data:` | Local production imagery; tracked map/Leaflet imagery uses embedded data URLs |
| Fonts | `'self'` | `/fonts/inter.css` and local TTF files |
| Media | `'self'` | Local MP4 hero media |
| Frames | None | No iframe/embed requirement found |
| Forms | `'self'` | Current form has no external action and is handled locally |
| Workers/manifests | No worker; same-origin manifest allowance is conservative | No Worker, service worker, WebSocket, EventSource, or blob-worker requirement found |

The fresh browser trace observed exactly three page-related external origins:
`www.googletagmanager.com`, `www.google-analytics.com`, and
`docs.google.com`. Chrome background-service traffic was excluded because it
was not initiated by the site.

Outbound links to Instagram, TikTok, YouTube, partner sites, Team Goodwin,
Pantheon, and other websites are top-level navigation and do not require CSP
source entries. The server-side Instagram module calls `graph.instagram.com`;
that origin is not a browser dependency and must not be added to browser CSP.
The current `/api/instagram-feed` production form is unavailable and the Will
page uses local fallback images. If a future feed returns remote image URLs,
its exact image CDN must be observed before CSP enforcement.

Inactive/legacy tracked bundles reference Google Fonts, CARTO/OpenStreetMap
tiles, YouTube thumbnails, and an R2 preview image. None was requested by the
reviewed current production pages or the fresh browser trace, so none is
allowlisted. This distinction prevents stale source from expanding the live
policy.

### MIME compatibility for `nosniff`

The active production samples use appropriate types:

- JavaScript/module: `text/javascript`
- CSS, including `/fonts/inter.css`: `text/css`
- TTF: `font/ttf`
- map topology: `application/json`
- hero video: `video/mp4`
- logo image: `image/png`

This evidence makes `X-Content-Type-Options: nosniff` low risk for the current
assets. The future validation must still exercise every page to find an
unsampled incorrectly typed file.

## 3. Inline code and dynamic-code constraints

Fourteen current production templates were inspected: the five requested
pages plus Updates, weeks 1–3, FAQ, Accessibility, Participation Terms,
Privacy, and Terms.

- Each template contains at least one inline script or inline style block.
- The homepage/live-tracking alias contains three inline scripts; Will,
  Updates, FAQ, and the policy pages contain two; the other sampled templates
  contain one.
- Each template contains one inline style block. The homepage also creates
  dynamic inline style attributes, and the tracker/map code changes element
  style properties at runtime.
- No inline event-handler attribute was found.
- No `eval()` or `new Function` requirement was found in the production HTML,
  active tracker/map assets, or downloaded tag script.
- No blob URL requirement was found.

Therefore the first global Report-Only policy needs both script and style
`'unsafe-inline'` to avoid a large known violation set. This is explicitly
temporary and is not acceptable as the final enforced policy. A hash-only
policy is technically possible for current static blocks, but it would be long,
brittle across all templates, and would not solve dynamically written style
attributes. Before enforcement, externalize the inline scripts/styles or
maintain reviewed hashes; do not add `'unsafe-eval'`.

## 4. Proposed Stage A — non-CSP headers

### Exact response values

```http
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
```

The map uses fixed route coordinates, not browser geolocation. No camera,
microphone, payment, USB, accelerometer, gyroscope, or magnetometer API use was
found. Autoplay/fullscreen are intentionally not disabled because the site has
video behavior and those capabilities were not part of the approved list.

No inbound framing requirement was found in production markup, project source,
or runtime behavior. `X-Frame-Options: DENY` is therefore appropriate. The
future CSP policy also declares `frame-ancestors 'none'`; until CSP is enforced,
X-Frame-Options provides the active clickjacking control.

`Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` should remain
deferred. They are not needed to deliver the smallest current improvement and
can alter popup/opener, OAuth, embedding, and cross-origin resource behavior.
They require a separate compatibility review rather than being bundled into
Stage A.

### Prepared LiteSpeed/Apache directives — do not apply in this task

The condition deliberately limits these headers to HTTPS requests for the apex
and `www`, and excludes the Passenger mount to avoid duplicate/conflicting
application-generated headers:

```apache
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
  Header always set Referrer-Policy "strict-origin-when-cross-origin" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
  Header always set X-Frame-Options "DENY" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
  Header always set Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
</IfModule>
```

The expression form follows the same host-scoped mechanism already validated
for TG-M03. `Header always set` is required so tenant-generated redirects and
error responses, including 401/403/404 where the root rules run, receive the
headers. Apache documents that `always` uses a different header table and warns
about duplicates; this is another reason to exclude the Passenger app, which
already emits some of these names. Validate exactly one field after deployment.
Provider-generated failures before tenant configuration runs may remain outside
application-owner control.

## 5. Proposed Stage B — CSP Report-Only

### Exact proposed header

```http
Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://docs.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://www.google-analytics.com; media-src 'self'; frame-src 'none'; form-action 'self'; worker-src 'none'; manifest-src 'self'
```

This policy contains no wildcard, `'unsafe-eval'`, blob source, external frame
source, external font source, guessed Instagram origin, or guessed map origin.
`upgrade-insecure-requests` is intentionally omitted because no mixed-content
dependency was observed and this stage must be monitoring-only rather than a
transport rewrite.

No CSP report collector currently exists. Do not invent a public collection
endpoint or send potentially sensitive report URLs to a third party as part of
this phase. Initial observation can use browser console messages,
`SecurityPolicyViolationEvent`, and controlled headless-browser runs. If a
central collector is later approved, add a privacy-reviewed same-origin
`Reporting-Endpoints`/`report-to` design separately.

### Prepared directive — do not apply in this task

```apache
<IfModule mod_headers.c>
  Header always set Content-Security-Policy-Report-Only "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://docs.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://www.google-analytics.com; media-src 'self'; frame-src 'none'; form-action 'self'; worker-src 'none'; manifest-src 'self'" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$# && %{REQUEST_URI} !~ m#^/strava(?:/|$)#"
</IfModule>
```

The header may appear on static assets as well as documents; browsers derive a
document policy from the HTML response, so the extra asset copy has no policy
effect. This simple URI boundary is preferable to an unverified MIME-condition
feature in the live shared-host configuration. Header presence and size must
still be validated through LiteSpeed after future deployment.

## 6. Static site versus Passenger Strava strategy

Use a split strategy:

- Root `.htaccess` owns the new headers only for the apex/`www` static surface,
  excluding `/strava`.
- The Passenger app keeps its existing enforced
  `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`,
  `Referrer-Policy: no-referrer`, and `nosniff` behavior unchanged.
- The Strava JSON endpoints do not render documents, use device capabilities,
  or need an additional Report-Only browser policy. Their enforced CSP is
  stronger and should not be replaced by the static policy.
- The existing host-scoped HSTS directive continues to apply independently to
  static and Strava responses. None of the prepared blocks sets, unsets, or
  edits HSTS.

This avoids duplicate CSP/referrer/nosniff fields and avoids weakening the
Strava app from `no-referrer` to the less restrictive static-site policy.

## 7. Regression-risk assessment

| Surface | Stage A risk | CSP Report-Only observation |
| --- | --- | --- |
| Live map/topology | Low; MIME types are correct | Requires self scripts/import/fetch, self JSON, `data:` images, and inline styles |
| Strava public API | No change; excluded from root rules | Same-origin connect remains allowed; app CSP is untouched |
| Google Sheets updates | No Stage A effect | Requires `docs.google.com` in `script-src`; JSONP remains a TG-M08 trust risk |
| Analytics/GTM | Referrer becomes origin-only cross-site | Requires GTM script and Analytics connect origins; new GTM tags may generate violations |
| Instagram/fallback | Local fallback unaffected | Current same-origin endpoint/fallback fits; future remote media must be inventoried |
| Fonts/images/video | Low; verified MIME types | Self sources plus `data:` images are present; no external font/media origin needed |
| OAuth | Passenger excluded; top-level navigation unaffected | Static report-only policy does not apply to Passenger callback responses |
| Webhook | Server-to-server; unaffected | No browser CSP effect |
| Basic Auth/admin | Passenger excluded; unaffected | Existing 401 security headers stay application-owned |
| Mobile browsers | Disabled hardware features are unused | Report-only cannot block; test Safari/Chrome plus video/map behavior |

Two future-state caveats block CSP enforcement today:

1. `window.MISSION_LIVE_TRACKING_ENDPOINT` is empty in current production. If
   an external live-tracking origin is configured later, add only its exact
   observed origin to `connect-src`, or keep the endpoint same-origin.
2. GTM configuration and any future Instagram response can change resource
   origins without a code deploy. They need change control and fresh CSP
   observation before enforcement.

## 8. Staged rollout plan

### Stage A — baseline non-CSP headers

1. Back up the live root `.htaccess` privately and record its SHA-256.
2. Inspect it for the validated HSTS block and all Passenger, rewrite, cache,
   compression, and security directives.
3. Add only the four prepared conditional `Header always set` lines in one
   `mod_headers` block. Do not edit HSTS and do not add CSP.
4. Validate the full checklist below. Retain Stage A only if fields occur once
   and no MIME, framing, video, map, form, or Strava regression appears.

### Stage B — CSP Report-Only

After Stage A is stable, add only the prepared
`Content-Security-Policy-Report-Only` line. Do not add an enforced CSP and do
not alter the Strava CSP.

### Stage C — observe and refine

Exercise every public template on desktop and mobile, the map before/after
lazy loading, updates with a cold and warm cache, analytics, fallback paths,
and the future live state if it becomes available. Classify each violation as
required, stale, browser-extension noise, or a defect. Narrow origins and
externalize/hash inline code. CSP enforcement requires a new authorization and
must not occur merely because Report-Only has been deployed.

## 9. Rollback

- Before either stage, retain the exact pre-change `.htaccess` outside
  `public_html` with restrictive permissions and a checksum.
- Stage A rollback: remove only the four new conditional header directives, or
  restore the exact private `.htaccess` backup if the edit causes a server
  error. Revalidate homepage, static errors, assets, Strava, and HSTS.
- Stage B rollback: remove only the
  `Content-Security-Policy-Report-Only` directive. It is not enforced and does
  not create an HSTS-like browser persistence obligation.
- These response headers take effect on the next uncached response. Preserve
  cache-busting/no-cache validation where useful. Do not remove or reduce the
  separately accepted `Strict-Transport-Security: max-age=86400` directive.

## 10. Production validation checklist

After a future separately approved Stage A or Stage B deployment:

- Confirm exactly one expected value on apex and `www` for each deployed
  header; confirm no comma-joined or conflicting fields.
- Confirm HSTS remains exactly one `max-age=86400`, without
  `includeSubDomains` or `preload`.
- Confirm excluded staging, Namecheap/cPanel, mail, and service hosts did not
  inherit the new root-site headers.
- Check `/`, `/the-run/`, `/will/`, `/fifty-runs/`, `/live-tracking/`, Updates,
  weeks 1–3, FAQ, Accessibility, Participation Terms, Privacy, and Terms.
- Check active JS, CSS, font, JSON topology, image, video, and map module
  responses; verify no MIME refusal after `nosniff`.
- Check static 403/404 and a safe representative redirect. Confirm `always`
  semantics worked without duplicate fields.
- Confirm the site cannot be framed by an unrelated origin and that no
  legitimate framing workflow was lost.
- Verify homepage/map lazy loading, 51 state shapes, 50 markers, three core
  paths, five flight paths, runner/RV markers, and static fallback.
- Verify Google Sheets updates with cold/warm local cache and degraded fallback.
- Verify GTM/Analytics network behavior and expected referrer privacy.
- Verify local fonts, video/autoplay behavior, images, outbound links, and the
  local form workflow on desktop and mobile Safari/Chrome.
- Verify `/strava/health`, 50 public races, correct race status, OAuth callback
  routing, webhook verification, and admin 401 protection are unchanged.
- For Stage B, record console/`SecurityPolicyViolationEvent` findings with a
  clean browser profile. Do not treat browser-extension traffic as a site
  requirement and do not broaden the policy without a reproduced production
  need.
- Confirm the static policy is absent from `/strava` and the Passenger app's
  enforced CSP, `no-referrer`, `nosniff`, CORS, cache, and authentication
  headers remain exact.

## 11. Control mapping and readiness

This preparation addresses the authoritative audit's TG-M04 objective and
supports TG-M08 without claiming that its JSONP/DOM trust work is remediated.
It maps to the audit's CIS/LiteSpeed secure-configuration and information-
disclosure objectives, OWASP ASVS browser/configuration themes, and OWASP Top
10:2025 A02/A05. The application owner can configure these tenant response
headers, while server modules, global virtual-host behavior, provider 5xx
responses, and LiteSpeed implementation details remain provider-controlled or
unverified. This is not a provider-level CIS compliance claim.

**Readiness result:** **PASS for Stage A.** The four baseline headers are a
small, reversible, host-scoped improvement and current production evidence does
not show a functional dependency they would break. **PASS for deploying Stage
B only as Report-Only after Stage A validation.** **BLOCKED for enforced CSP**
until monitoring is clean, inline code is externalized or hashed, JSONP is
retired or explicitly accepted, and future live/Instagram/GTM origins are
controlled.

## References

- Apache HTTP Server 2.4 `mod_headers` documentation:
  <https://httpd.apache.org/docs/2.4/mod/mod_headers.html>
- W3C Content Security Policy Level 3:
  <https://www.w3.org/TR/CSP3/>
- W3C Permissions Policy:
  <https://www.w3.org/TR/permissions-policy-1/>
