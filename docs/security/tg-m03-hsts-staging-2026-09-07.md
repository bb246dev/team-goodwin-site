# TG-M03 staged HSTS remediation and closure record — 2026-09-07

## Status and decision

**Final status: CLOSED — ACCEPTED HOST-ONLY POLICY / RESIDUAL RISK ACCEPTED.**

**Production validation: Stage 1 PASS; Stage 2 PASS.**

**Preparation observation:** 2026-09-07, approximately 11:55–12:08 AST

**Stage 1 validation:** 2026-09-07, approximately 12:20–12:32 AST

**Stage 2 validation:** 2026-09-07, approximately 12:38–12:42 AST

**Formal closure:** 2026-09-07

**Production origin:** `https://goodwingoodge.com`

Stage 1 used a five-minute HSTS policy on only `goodwingoodge.com` and
`www.goodwingoodge.com`, sent only over HTTPS:

```http
Strict-Transport-Security: max-age=300
```

Stage 2 now uses the same host-only scope with a 24-hour duration:

```http
Strict-Transport-Security: max-age=86400
```

`includeSubDomains` is **not safe**. Nine cPanel/mail/service names resolve to
the shared host but fail HTTPS hostname verification, and several still serve
or authenticate over plain HTTP. `preload` is also **not safe** and the domain
does not meet preload requirements. Neither token is part of this plan.

The operator subsequently enabled the intended short policy. This validation
was read-only: it did not inspect or change `.htaccess`, cPanel, DNS,
production, application/runtime code, the backend, the database, or GitHub.
This security record and the authoritative audit are the only files updated by
the formal closure. Stages 1 and 2 satisfy the accepted scoped `AH-19` objective
for the apex and `www`.

## Formal closure and residual-risk acceptance

Team Goodwin intentionally accepts and retains this production policy:

```http
Strict-Transport-Security: max-age=86400
```

The policy applies only to `goodwingoodge.com` and `www.goodwingoodge.com` over
HTTPS. `includeSubDomains` is intentionally excluded because the discovered
Namecheap/cPanel/mail/service aliases do not all satisfy HTTPS hostname
requirements. `preload` is intentionally excluded because it would require the
unsafe subdomain commitment and a substantially longer irreversible browser
commitment.

The accepted residual risk is that a browser which has not refreshed the HSTS
policy within 24 hours—or whose state has been cleared—again relies on the
site's first HTTP-to-HTTPS redirect and is exposed to a larger downgrade window
than under a one-year policy. Team Goodwin accepts that tradeoff as
proportionate to this project's threat model and shared-hosting constraints.

The previously proposed `max-age=31536000` stage is deferred and is not a
closure requirement for this project. A future reassessment may consider a
longer host-only duration if the hosting architecture changes, service aliases
are retired or gain valid HTTPS coverage, or the project's risk tolerance
changes. Such a reassessment does not authorize `includeSubDomains` or preload
without a new complete hostname and operational review.

## Stage 2 production validation evidence

### Header and redirect result

- Eleven scoped HTTPS responses were requested independently: the apex and
  `www` homepages, The Run, Will, Fifty Runs, Live Tracking, both active map
  JavaScript assets, and all three public Strava endpoints.
- Every response returned HTTP `200` and exactly one field with the exact value
  `Strict-Transport-Security: max-age=86400`.
- No sampled response contained a duplicate or comma-joined HSTS value,
  `includeSubDomains`, `preload`, or a conflicting `max-age`.
- Plain HTTP on both the apex and `www` returned one exact `301` hop to the
  corresponding HTTPS hostname and path, followed by HTTP `200`. No redirect
  loop or unexpected chain was observed.

### Application, asset, and Strava result

- `/`, `/the-run/`, `/will/`, `/fifty-runs/`, and `/live-tracking/` returned
  HTTP `200` with expected response sizes and content. No sampled response
  returned `500`.
- The apex, `www`, and `/live-tracking/` bodies remained byte-identical with
  SHA-256
  `edfe3abd43998cf94655c92a1a7cda8e1137bc5f37a50b4858e10b1689910d51`.
- `/assets/tracker-base.js` returned HTTP `200` and retained approved SHA-256
  `a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54`.
- `/assets/strava-race-map.mjs` returned HTTP `200` and retained approved
  SHA-256
  `7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80`.
- `/strava/health` returned exactly `{"status":"ok"}`.
- `/strava/public/races` returned HTTP `200` with 50 races.
- `/strava/public/race-status` returned HTTP `200`, `active:false`, zero
  completed races, 50 total races, and the expected October 9–November 1 race
  window.
- Unauthenticated `/strava/status`, `/strava/candidates`, and
  `/strava/connect` requests each returned HTTP `401`, the existing
  administrator Basic challenge, and `{"error":"unauthorized"}`. Each also
  carried exactly one Stage 2 HSTS field.

### Browser and map result

- A new hidden in-app-browser tab loaded all five representative pages to
  `document.readyState === "complete"` with no console entries, active
  `http://` references, protocol-relative references, computed HTTP background
  images, or broken images.
- The homepage preserved near-viewport map lazy loading. Before entering the
  viewport the map had not started; afterward `mapLoadStarted` and `mapReady`
  were true and the DOM contained 51 state shapes, 50 race markers, three core
  route paths, one runner marker, and one RV marker with no console errors.
- The persistent in-app browser again rendered zero flight paths, matching the
  cache-specific limitation recorded in Stage 1 rather than a new Stage 2
  change. Both served map assets matched their approved hashes, and all live
  public APIs returned their expected responses. A fresh-profile flight-path
  confirmation remains a gate before any future one-year stage, but this
  persistent-cache observation does not block retaining the 24-hour policy.

### Excluded-host result

- `staging.goodwingoodge.com` and `www.staging.goodwingoodge.com` returned valid
  HTTPS responses without an HSTS field.
- The nine previously identified certificate-mismatched shared-hosting aliases
  (`mail`, `cpanel`, `webmail`, `webdisk`, `ftp`, `autodiscover`, `autoconfig`,
  `cpcontacts`, and `cpcalendars`) were sampled read-only using the documented
  diagnostic limitation. None emitted HSTS.
- Stage 2 therefore remains isolated from the discovered staging,
  Namecheap/cPanel, mail, and service hostnames.

**Stage 2 decision:** `max-age=86400` is safe to retain with the current
host-only scope. The project owner has accepted the shorter-duration residual
risk and closed TG-M03 at this validated policy. Do not increase the duration,
add `includeSubDomains`, or add `preload` under this closure decision.

## Stage 1 production validation evidence

### Header and redirect result

- Twelve scoped HTTPS responses were requested independently: the apex and
  `www` homepages, The Run, Will, Fifty Runs, both live-tracking aliases, both
  active map JavaScript assets, and the three public Strava endpoints.
- Every response returned HTTP `200` and exactly one field with the exact value
  `Strict-Transport-Security: max-age=300`.
- No response contained a second or comma-joined HSTS value,
  `includeSubDomains`, `preload`, or a conflicting `max-age`.
- Plain HTTP on both the apex and `www` returned one `301` hop to the same
  hostname and path on HTTPS, followed by a `200`. There was no loop,
  unexpected chain, or HSTS field on the HTTP response.
- The sampled static pages, static assets, Passenger health response, and
  Passenger public APIs retained their expected existing cache/security header
  profiles; no new header conflict was observed.

### Application, route, and Strava result

- `/`, `/the-run/`, `/will/`, `/fifty-runs/`, `/live-tracking/`, and
  `/live-tracking.html` all returned HTTP `200` with their expected titles and
  content. No sampled response returned `500`.
- The apex, `www`, `/live-tracking/`, and `/live-tracking.html` response bodies
  were byte-identical, all with SHA-256
  `edfe3abd43998cf94655c92a1a7cda8e1137bc5f37a50b4858e10b1689910d51`.
  The September 6 controlled-merge benchmark records the same alias behavior
  and the same document hash before HSTS, so this is pre-existing routing, not
  a Stage 1 regression.
- `/assets/tracker-base.js` remained HTTP `200` with approved SHA-256
  `a6c9fea694c1bb73181ed1a9ca9801169326bd8194c576e453b2d4faf2928c54`.
- `/assets/strava-race-map.mjs` remained HTTP `200` with approved SHA-256
  `7a750659403f256d7a5305b84f164da7a75041d362627e016c6e5457c9de9b80`.
- `/strava/health` returned exactly `{"status":"ok"}`.
- `/strava/public/races` returned HTTP `200` with 50 races.
- `/strava/public/race-status` returned HTTP `200`, `active:false`, zero
  completed races, 50 total races, and the expected October 9–November 1 race
  window.

### Browser and map result

- A new hidden in-app-browser tab loaded all six representative pages to
  `document.readyState === "complete"` with no console entries, active
  `http://` resource references, protocol-relative resource references,
  computed HTTP background images, or broken images.
- The homepage preserved near-viewport lazy loading: before the map entered the
  viewport it had not started; afterward `mapLoadStarted` and `mapReady` were
  both true. It rendered 51 state shapes, 50 race markers, three core route
  paths, one runner marker, and one RV marker, without console errors.
- The persistent in-app-browser cache rendered zero flight paths, the same
  cache-specific limitation already recorded during TG-M03 preparation. The
  served tracker asset independently matched the approved production hash that
  passed the five-flight-path production baseline. With no asset change,
  console error, or request failure, this is not evidence of an HSTS regression;
  a fresh-profile visual recheck remains an observation-period follow-up.

### Excluded-host result

- `staging.goodwingoodge.com` and `www.staging.goodwingoodge.com` returned their
  valid HTTPS pages without an HSTS field.
- The nine known certificate-mismatched shared-hosting aliases (`mail`,
  `cpanel`, `webmail`, `webdisk`, `ftp`, `autodiscover`, `autoconfig`,
  `cpcontacts`, and `cpcalendars`) were tested read-only after preserving the
  previously documented certificate limitation; none emitted HSTS.
- These results confirm that Stage 1 is not being unintentionally applied to
  the discovered staging, Namecheap, cPanel, mail, or service hostnames.

**Historical Stage 1 decision:** the exact five-minute policy was safe to keep.
At that checkpoint TG-M03 remained open and was allowed to progress to the
separately validated 24-hour host-only stage. This interim decision is
superseded by the formal closure above.

## Hard scope boundary

This plan does not authorize:

- an HSTS or other response-header change;
- editing or creating `.htaccess` in production;
- changing cPanel, DNS, certificates, mail, service hostnames, or Passenger;
- enabling `includeSubDomains` or `preload`;
- changing application code, Strava routes, OAuth, webhook behavior, the map,
  admin authentication, databases, dependencies, or GitHub;
- increasing the current Stage 2 `max-age` beyond 86400 seconds; or
- deploying or committing anything.

## Methods and limitations

The inventory used the current workspace, tracked Git history, passive DNS
queries for a bounded list of known/standard service names, MX/NS/SRV records,
public Certificate Transparency data, one random-label DNS control, low-volume
HTTP/HTTPS requests, and four targeted TLS negotiations. It did not brute-force
DNS, scan ports or ciphers, authenticate to cPanel, inspect the DNS zone, or
change external state.

The full authenticated DNS zone and the live root `.htaccess` were not
available. The repository has no tracked `.htaccess`; the live file must be
backed up and inspected in cPanel immediately before any future change. Passive
discovery cannot prove that no private, split-horizon, or undisclosed hostname
exists. That limitation blocks `includeSubDomains` and preload, but it does not
block the explicitly host-scoped apex/`www` stage below.

## Hostname and subdomain inventory

### DNS overview

- `goodwingoodge.com` resolves to IPv4 `198.54.120.146`; no AAAA answer was
  observed.
- `www.goodwingoodge.com` is a CNAME to the apex and reaches the same IPv4
  address.
- All other resolving names below also returned `198.54.120.146`, with no AAAA
  answer observed.
- Name servers are `dns1.namecheaphosting.com` and
  `dns2.namecheaphosting.com`.
- Mail exchange is external to the domain:
  `mx1-hosting.jellyfish.systems` (priority 5),
  `mx2-hosting.jellyfish.systems` (10), and
  `mx3-hosting.jellyfish.systems` (20). These MX names are not subdomains of
  `goodwingoodge.com`, so an apex HSTS policy cannot inherit to them.
- `_autodiscover._tcp.goodwingoodge.com` points to
  `cpanelemaildiscovery.cpanel.net:443`.
- No CAA answer was observed. This is not a TG-M03 blocker and no CAA change is
  proposed.
- `api.goodwingoodge.com`, `dev.goodwingoodge.com`, and the one unique random
  control name returned `NXDOMAIN`; the tested DNS does not behave as a simple
  wildcard.
- Current project material names only the apex and `www`. The reachable Git
  history names only the apex. Passive Certificate Transparency data adds
  `staging.goodwingoodge.com` and `www.staging.goodwingoodge.com`.

### Per-host web and certificate observations

`Valid` below means the default HTTPS request completed with normal certificate
and hostname verification. For service names marked `mismatch`, the request was
first allowed to fail normally; the listed HTTP status was then observed only
with certificate verification deliberately bypassed for read-only diagnosis.
That bypass is not a viable user or production configuration.

| Hostname | DNS | HTTP on port 80 | HTTPS on port 443 | Certificate/hostname result | HSTS inheritance consequence |
| --- | --- | --- | --- | --- | --- |
| `goodwingoodge.com` | A `198.54.120.146` | `301` to the same URL on HTTPS | `200` | Valid; primary certificate covers apex | Direct Stage 1 target |
| `www.goodwingoodge.com` | CNAME apex | `301` to the same `www` URL on HTTPS | `200`; no further canonical redirect | Valid; primary certificate covers `www` | Send its own short policy; no inheritance token needed |
| `staging.goodwingoodge.com` | A `198.54.120.146`; CT-discovered | `301` to same host on HTTPS | `200` | Valid staging certificate | Would inherit from apex if `includeSubDomains` were enabled; excluded from Stage 1 |
| `www.staging.goodwingoodge.com` | A `198.54.120.146`; CT-discovered | `301` to same host on HTTPS | `200` | Valid staging certificate covers this name | Would inherit from apex; excluded from Stage 1 |
| `mail.goodwingoodge.com` | A `198.54.120.146` | `200`; body matched the apex homepage | `200` only after bypass | Hostname mismatch | Apex `includeSubDomains` would force its HTTP web surface to invalid HTTPS |
| `cpanel.goodwingoodge.com` | A `198.54.120.146` | `301` to same host on HTTPS | cPanel login `200` only after bypass | Hostname mismatch | HSTS would remove any certificate-error bypass for this browser hostname |
| `webmail.goodwingoodge.com` | A `198.54.120.146` | `301` to same host on HTTPS | Webmail login `200` only after bypass | Hostname mismatch | Same blocking risk as cPanel |
| `webdisk.goodwingoodge.com` | A `198.54.120.146` | `401` over HTTP | `401` only after bypass | Hostname mismatch | HSTS would force the HTTP surface to invalid HTTPS |
| `ftp.goodwingoodge.com` | A `198.54.120.146` | `200` over HTTP | `200` only after bypass | Hostname mismatch | HSTS affects this hostname's browser HTTP surface, not the FTP protocol itself |
| `autodiscover.goodwingoodge.com` | A plus external SRV target | `302` to `https://cpanelemaildiscovery.cpanel.net/...` | `400` only after bypass | Hostname mismatch | Especially unsafe: HSTS would upgrade before the working external redirect |
| `autoconfig.goodwingoodge.com` | A `198.54.120.146` | `200` over HTTP | `200` only after bypass | Hostname mismatch | HSTS would force the HTTP configuration surface to invalid HTTPS |
| `cpcontacts.goodwingoodge.com` | A `198.54.120.146` | `401` over HTTP | `401` only after bypass | Hostname mismatch | HSTS would force the HTTP surface to invalid HTTPS |
| `cpcalendars.goodwingoodge.com` | A `198.54.120.146` | `401` over HTTP | `401` only after bypass | Hostname mismatch | HSTS would force the HTTP surface to invalid HTTPS |
| `api.goodwingoodge.com` | `NXDOMAIN` | Not applicable | Not applicable | No host/certificate | A future name would inherit if apex `includeSubDomains` were later enabled |
| `dev.goodwingoodge.com` | `NXDOMAIN` | Not applicable | Not applicable | No host/certificate | Same future-name risk |

All nine tested cPanel/mail/service names failed normal HTTPS validation with a
certificate-name error. A representative TLS inspection of
`mail.goodwingoodge.com` showed a trusted provider certificate for
`*.web-hosting.com` and `web-hosting.com`, not for any
`*.goodwingoodge.com` name. It was issued by Sectigo and is valid from
2026-06-03 through 2026-12-18, but its otherwise valid chain does not cure the
hostname mismatch.

This is conclusive evidence that a blanket root `.htaccess` directive or apex
`includeSubDomains` policy would be inappropriate. It also shows why the future
directive must include an explicit host condition rather than relying only on
its location in `public_html`.

## Root HTTP and HTTPS behavior

| Starting URL | First response | Final URL/status | Redirect count | Result |
| --- | --- | --- | ---: | --- |
| `http://goodwingoodge.com/` | `301 Location: https://goodwingoodge.com/` | `https://goodwingoodge.com/` / `200` | 1 | PASS |
| `http://www.goodwingoodge.com/` | `301 Location: https://www.goodwingoodge.com/` | `https://www.goodwingoodge.com/` / `200` | 1 | PASS |
| `https://www.goodwingoodge.com/` | `200` | same URL / `200` | 0 | Healthy, but `www` is not canonicalized to apex |

The redirect preserved a cache-busting query value. Sample path checks for The
Run, an active asset, `/strava/health`, and `www` Live Tracking also returned one
exact `301` to the same path over HTTPS. No chain or loop was observed.

Serving both apex and `www` is acceptable for Stage 1 because both have valid
certificates and safe redirects from HTTP. Each hostname stores its HSTS policy
separately, so the proposed rule deliberately emits the same short policy on
both primary website names.

## Primary TLS and certificate findings

| Item | Observation | Status |
| --- | --- | --- |
| Leaf subject | `CN=goodwingoodge.com` | PASS |
| Issuer | `SSL.com TLS Issuing RSA CA R1` | PASS |
| Validity | 2026-08-31 17:12:50 UTC through 2027-03-17 17:08:31 UTC | Valid on observation date |
| SANs | `goodwingoodge.com`, `www.goodwingoodge.com` | Covers both Stage 1 hosts |
| Key/signature | RSA 2048; SHA-256 with RSA | No obvious issue in this limited check |
| SHA-256 fingerprint | `23:E8:A7:AD:07:E1:B1:E6:90:A3:23:97:F2:5F:C7:EF:15:4C:EC:B2:0A:F3:5A:44:C9:F0:65:21:0C:2A:1A:A5` | Recorded for evidence |
| Chain | Client verification code `0 (ok)` | PASS |
| TLS 1.2 | Negotiated successfully | PASS |
| TLS 1.3 | Negotiated successfully | PASS |
| TLS 1.0 | Rejected with protocol-version alert | PASS |
| TLS 1.1 | Rejected with protocol-version alert | PASS |
| HTTP version | HTTP/2 observed | Informational |

No aggressive or complete cipher scan was run. Cipher policy, AutoSSL renewal,
front-end virtual-host configuration, and the exact LiteSpeed/OpenSSL build
remain provider-controlled or unverified. These external observations support a
short application-owner HSTS stage; they are not a claim of provider-level CIS
compliance.

The public staging certificate separately covers
`staging.goodwingoodge.com` and `www.staging.goodwingoodge.com`, is issued by
the same SSL.com intermediate, validates normally, and is valid from
2026-09-01 02:09:44 UTC through 2027-03-18 02:19:02 UTC.

## Mixed-content review

The following HTTPS pages each returned `200` with expected titles and reached
`document.readyState="complete"` in a production browser:

- homepage;
- The Run;
- Will;
- Fifty Runs; and
- Live Tracking.

For every page:

- downloaded production HTML contained no literal `http://` URL;
- the live DOM contained no `http://` active resource, no protocol-relative
  active resource, and no computed `background-image` using HTTP;
- active resource origins were limited to `https://goodwingoodge.com` and
  `https://www.googletagmanager.com`; and
- the browser console log was empty before the map's near-viewport lazy gate.

The Live Tracking map was then moved near the viewport so its deferred code and
data paths also ran. It still produced no HTTP resource. The persistent browser
logged the known first relative topology-path `404` warning before the second
relative source succeeded; the map reached `data-map-ready="true"` and rendered
51 state shapes, 50 race markers, three core route paths, and both runner/RV
markers. That fallback warning and this browser profile's previously documented
cached lack of flight paths predate TG-M03 and are not mixed-content findings.
The future validation gate therefore retains the fresh-profile requirement for
all five flight paths rather than treating this persistent profile as the map
completeness authority.

No required mixed-content or HTTP-only production dependency was found. A
repository browser bundle contains a normal outbound navigation link to
`http://teamgoodwin.com/run`; it is not a fetched subresource, did not appear as
an active resource on the tested pages, and does not create mixed content. Link
hygiene for that unrelated destination is outside TG-M03.

## Pre-deployment HSTS state (superseded by Stage 1)

`Strict-Transport-Security` was absent from every tested response:

| Surface | HTTP result | HSTS |
| --- | ---: | --- |
| HTTP apex redirect | 301 | Absent |
| HTTP `www` redirect | 301 | Absent |
| HTTPS apex and `www` homepages | 200 | Absent |
| The Run, Will, Fifty Runs, Live Tracking | 200 | Absent |
| `/assets/tracker-base.js` | 200 | Absent |
| `/assets/` | 403 | Absent |
| `/strava/health` | 200 | Absent |
| `/strava/public/races` | 200 | Absent |
| unknown static and Strava paths | 404 | Absent |
| staging apex/`www` over HTTPS | 200 | Absent |

No duplicate or conflicting HSTS source is presently visible at the edge,
static site, Passenger mount, asset handler, redirect handler, or tested error
handler. The domain's preload API status was `unknown`, with no preloaded parent
reported.

## Shared-hosting impact and policy decisions

### `includeSubDomains`: unsafe / blocked

Do not enable it. The valid apex policy would be inherited by every subdomain,
including the nine service names with certificate mismatches and any future or
non-public host omitted by passive discovery. The external autodiscover redirect
is a concrete break scenario because a browser or HSTS-aware client would
upgrade the original subdomain request before receiving its HTTP redirect.

The cPanel/mail aliases must be intentionally retired, moved to provider names,
or covered by valid certificates and forced to HTTPS, and an authenticated DNS
zone inventory must pass before this decision can be revisited.

### Preload: intentionally excluded

Do not add the `preload` token and do not submit the domain. The retained policy
is host-only `max-age=86400`; `includeSubDomains` is unsafe, and not all
resolving subdomains support valid HTTPS. Preload would require at least a
one-year max-age, `includeSubDomains`, the `preload` token, and HTTPS across all
subdomains. Those commitments are deliberately outside this project's accepted
proportional policy.

### Initial host scope

Apply Stage 1 only when the request is HTTPS and the host is exactly
`goodwingoodge.com` or `www.goodwingoodge.com` (allowing the explicit default
port). Do not emit it on staging, mail, cPanel, webmail, webdisk, FTP,
autodiscover/autoconfig, contacts/calendar, arbitrary Host values, or plain HTTP.

## Historical Stage 1 directive

If the live root file does not already contain an equivalent HSTS source or a
conflicting response-header mechanism, add this block to
`/home/goodfjcw/public_html/.htaccess`, outside Passenger, rewrite, caching,
compression, and generated cPanel sections:

```apache
<IfModule mod_headers.c>
    Header always set Strict-Transport-Security "max-age=300" "expr=%{HTTPS} == 'on' && %{HTTP_HOST} =~ m#(?i)^(www\.)?goodwingoodge\.com(?::443)?$#"
</IfModule>
```

The intended wire response is exactly one field:

```http
Strict-Transport-Security: max-age=300
```

The exact block passed a read-only syntax check with local Apache 2.4.67
(`Syntax OK`). That confirms the documented Apache expression form, but it is
not a substitute for the immediate live LiteSpeed/cPanel validation and
rollback gate.

Why this form:

- LiteSpeed documents use of `Header` in the site's root `.htaccess` for HSTS.
- Apache `mod_headers` permits `Header` in `.htaccess`, supports an `expr`
  condition, and documents `always` for error/internal-redirect responses.
- `%{HTTPS}` prevents emission on plain HTTP, as required by the HSTS protocol.
- the Host expression prevents a shared `public_html` rule from pinning staging
  or the cPanel/mail aliases;
- `set`, rather than `add` or `append`, minimizes duplicate values within this
  header table; and
- `always` is intended to cover static, Passenger, redirect/error, and other
  non-2xx HTTPS responses consistently.

The exact LiteSpeed build and its enabled override/module policy are
provider-controlled. If this expression is rejected, produces any `500`, fails
to cover the Passenger mount, or emits more than one HSTS field, restore the
backup immediately. Do not fall back to an unconditioned shared-root rule. Ask
Namecheap to apply the equivalent condition at the primary web virtual host.

## Historical Stage 1 cPanel action

These are future operator steps only; none was executed in preparation:

1. Sign in to the normal Namecheap cPanel account with MFA and open **File
   Manager**. Enable **Show Hidden Files (dotfiles)**.
2. Locate `/home/goodfjcw/public_html/.htaccess`. Do not use an `.htaccess`
   under `assets`, `strava-app`, or the Passenger application root.
3. Before editing, copy the file outside `public_html`, for example to
   `/home/goodfjcw/security-backups/2026-09-07/tg-m03/public_html.htaccess.pre-tg-m03`.
   Keep the directory owner-only (`0700`) and the file owner-only (`0600`) where
   cPanel permits. Record its byte count and SHA-256.
4. Inspect the full live file for any existing
   `Strict-Transport-Security`, `Header`, host-conditional, cPanel-generated,
   LiteSpeed, or Passenger rule. If an HSTS source or conflicting host/header
   mechanism exists, stop without editing and reconcile it first.
5. Add only the exact block above. If an existing suitable
   `<IfModule mod_headers.c>` block exists, add only the `Header` line inside it
   rather than nesting or duplicating the wrapper.
6. Do not reorder, reformat, or change Passenger, rewrite, cache, compression,
   indexing, or security directives. Save once and keep the editor/recovery
   copy available.
7. Immediately run the validation checklist below. Any `500`, unhealthy page,
   absent/duplicate header, header on an excluded host, or missing Passenger
   coverage triggers rollback.
8. Leave `max-age=300` unchanged for the separately approved observation
   period. Increasing it is a later decision and is not authorized here.

No application package upload, Passenger restart, database migration, DNS
change, or build is required for this proposed server-response-header change.

## Rollback procedure

1. Remove only the exact TG-M03 block. If any other byte changed, restore the
   private pre-TG-M03 `.htaccess` copy instead.
2. Confirm the root file matches the recorded pre-change SHA-256, except where
   an explicitly reviewed line-only removal was used.
3. Request the apex, `www`, an asset, an HTTPS 404, `/strava/health`, and a
   Strava 404. Confirm there is no HSTS header and no `500` response.
4. Recheck the raw HTTP apex and `www` URLs with `curl` or a fresh browser
   profile; a browser with cached HSTS may rewrite the request locally and is
   not suitable for observing the server's port-80 redirect.
5. Keep valid HTTPS continuously available. Browsers that received the current
   policy can continue forcing HTTPS for up to 86400 seconds (24 hours) after
   their last response containing the header. Removing the server directive
   stops refreshing that timer but does not erase already cached client state.

If an immediate client clear is operationally necessary while HTTPS remains
healthy, a separately approved emergency response of
`Strict-Transport-Security: max-age=0` can clear the policy for clients that
revisit over valid HTTPS. It cannot reach clients that do not reconnect, and it
does not replace restoring healthy HTTPS. Under the retained policy, the normal
client-cache rollback window is up to 24 hours.

## Stage 1 post-deployment validation checklist (historical)

This checklist is retained as the original five-minute rollout record. The
current Stage 2 result and its 24-hour evidence are recorded near the top of
this document.

### Header and routing

- [ ] Apex and `www` HTTPS homepages return 200 and each emits exactly one
  `Strict-Transport-Security: max-age=300` field.
- [ ] The Run, Will, Fifty Runs, and Live Tracking remain 200 with expected
  content and exactly one identical HSTS field.
- [ ] Active JS/CSS/image/font assets remain reachable and emit exactly one
  identical HSTS field; `/assets/` remains a non-listing 403 with the field.
- [ ] `/strava/health`, public races, public race status, protected 401s,
  webhook negative checks, static 404s, and Strava 404s emit exactly one
  identical HSTS field over HTTPS.
- [ ] No response contains `includeSubDomains`, `preload`, another `max-age`, a
  comma-joined HSTS value, or a second HSTS field.
- [ ] Plain HTTP apex and `www` still return one exact 301 to the same HTTPS
  host/path/query, without an HSTS field, chain, or loop.
- [ ] Valid staging URLs and diagnostic requests to shared service aliases do
  not receive the TG-M03 field.

### Application and browser regression

- [ ] Homepage, The Run, Will, Fifty Runs, and Live Tracking are healthy in a
  fresh desktop browser and a representative mobile browser.
- [ ] DevTools reports no mixed-content warning, new console error, broken
  image, or unexpected first-party/network failure.
- [ ] No active resource uses HTTP or a protocol-relative URL.
- [ ] Map near-viewport lazy loading remains intact.
- [ ] The live map renders 51 state shapes, 50 race markers, three core route
  paths, five flight paths, and the runner and RV markers.
- [ ] The Strava public integration loads near the map viewport and the static
  fallback remains functional when the public data is unavailable/malformed.
- [ ] `/strava/health` remains generic and healthy; `/strava/public/races`
  returns 50 races; `/strava/public/race-status` remains correct.
- [ ] Admin routes remain protected, OAuth/Will's connection is unaffected,
  and the webhook verification boundary remains intact.

### Historical observation and closure gate

- [ ] Monitor page, map, Strava, certificate, and external uptime signals for
  the approved Stage 1 observation window without raising `max-age`.
- [ ] Repeat header checks from an uncached client/network and confirm exact
  once-only behavior on static, Passenger, error, and asset responses.
- [ ] Record deployment time, live `.htaccess` backup path/checksum, response
  evidence, browser versions, and rollback test/evidence.
- [x] Update this record and the authoritative audit after the staged checks
  pass and the residual-risk decision is accepted. TG-M03 and scoped `AH-19`
  are closed/pass at host-only `max-age=86400`.

## CIS/OWASP mapping and responsibility boundary

| Audit objective | Owner/control plane | Current state | Staged effect |
| --- | --- | --- | --- |
| `AH-18` — redirect HTTP to HTTPS | Shared application/hosting | PASS; reconfirmed | No change; must remain PASS |
| `AH-19` — browser transport persistence/HSTS | Application owner through domain root configuration | PASS; TG-M03 closed with accepted residual risk | Exact host-only 24-hour policy validated; no provider-level claim |
| `AH-15` — reject TLS 1.0/1.1 and allow modern TLS | Namecheap/LiteSpeed listener | Externally observed PASS | No configuration claim or change |
| `AH-16` — valid certificate/chain/hostname | Namecheap/AutoSSL plus domain owner | Externally observed PASS for apex/`www` | No provider-level CIS claim |
| `AH-17` — weak cipher/protocol configuration | Namecheap | UNABLE TO VERIFY beyond protocol samples | Remains unverified |
| `AH-22` — virtual-host/override hardening | Namecheap | PROVIDER-CONTROLLED | Remains provider-controlled |

The CIS Apache HTTP Server objective is used as the audit's closest transport
configuration baseline for LiteSpeed. TG-M03 can remediate only the
application-owner HSTS objective. It does not prove the server, TLS listener,
cipher policy, AutoSSL, virtual hosts, or Namecheap platform compliant with a
CIS benchmark. The associated OWASP mapping remains Security Misconfiguration
and Insecure Design/secure-communications configuration as recorded in the
authoritative audit.

## Evidence references

- [Team Goodwin authoritative audit](cis-owasp-audit-2026-09-07.md)
- [RFC 6797 — HTTP Strict Transport Security](https://datatracker.ietf.org/doc/html/rfc6797)
- [LiteSpeed HSTS configuration](https://docs.litespeedtech.com/lsws/security/#http-strict-transport-security)
- [LiteSpeed security response headers](https://docs.litespeedtech.com/lsws/security-headers/)
- [Apache `mod_headers`](https://httpd.apache.org/docs/2.4/mod/mod_headers.html)
- [Apache expression variables and syntax](https://httpd.apache.org/docs/current/expr.html)
- [cPanel HSTS configuration note](https://support.cpanel.net/hc/en-us/articles/360055614293-PCI-How-to-enable-HSTS-on-a-cPanel-server)
- [HSTS preload requirements](https://hstspreload.org/)
- [Passive Certificate Transparency query](https://crt.sh/?q=%25.goodwingoodge.com)

## Final closure conclusion

The primary website pair has clean one-hop HTTP-to-HTTPS redirects, valid
certificate coverage, TLS 1.2 and TLS 1.3, no observed mixed-content dependency,
and exactly one validated `max-age=86400` HSTS field across the sampled static,
asset, and Passenger responses. The host-only 24-hour policy is safe to retain.

TG-M03 is **CLOSED — ACCEPTED HOST-ONLY POLICY / RESIDUAL RISK ACCEPTED**. A
one-year duration is deferred and not required for this project. An
unconditioned shared-root header, `includeSubDomains`, preload, or a longer
duration is not authorized by this closure. Rollback remains removal of only
the host-scoped HSTS directive, with awareness that clients may retain the
cached policy for up to 24 hours. Reassess only if hosting/service-host
architecture or project risk tolerance materially changes.
