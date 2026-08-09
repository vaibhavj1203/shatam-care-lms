# Shatam Care Branding — Current State

Status: **placeholder**, applied so the product looks/feels coherent before
real brand assets exist. Everything here is swappable without code changes
except where noted.

## What's applied now

- **Color palette**: green (`green-700`/`green-800`/`green-50` Tailwind
  shades) used consistently across the Next.js frontend — header, buttons,
  links, badges. Chosen as a generic "care/health" placeholder, not based on
  any actual Shatam Care brand guideline.
- **App name**: "Shatam Care Learning" in the frontend (page title, header),
  "Shatam Care Foundation" set as `Website Settings.app_name` on the backend
  (`shatam_care/install.py`, runs on app install) — this is what the stock
  `Certificate` print format displays on issued certificates.
- **Certificate template**: reusing stock `lms`'s existing `Certificate`
  Print Format (`lms/lms/print_format/certificate`) rather than building a
  new one from scratch — it already pulls `app_name` and `banner_image` from
  Website Settings, is well-designed, and just needs real assets swapped in
  (see below). Certificates are NOT using the generic "Standard" Frappe
  print format — that was a bug caught and fixed during this build (see
  `certificate_issuance.py`).
- **App icon**: `hooks.py` references `/assets/shatam_care/images/shatam-care-logo.png`,
  which **does not exist yet** — no placeholder image was faked in its
  place. This will 404 quietly (shows as a broken icon in Frappe's app
  switcher) until a real logo file is added at that path.

## What to swap once real assets arrive

No code changes needed for any of these — all are either config (Website
Settings, done via the desk UI) or file replacement:

1. **Logo**: upload to `Website Settings.banner_image` (backend, feeds the
   certificate template) and add a real file at
   `shatam_care/shatam_care/public/images/shatam-care-logo.png` (referenced
   by `app_icon_url` in `hooks.py`).
2. **Color palette**: replace the `green-*` Tailwind classes throughout
   `shatam-care-web/src/` with real brand colors — every usage is a Tailwind
   utility class, no hardcoded hex values to hunt down, but there's no
   central theme file yet (a `tailwind.config` color extension would be the
   right refactor once real colors are known, rather than a find-replace).
3. **Certificate design**: once Shatam provides an actual certificate
   template/design, either restyle the reused `Certificate` Print Format's
   CSS/HTML, or replace it entirely — `certificate_issuance.py`'s
   `get_certificate_template()` already supports swapping in per-language
   Print Formats named `Shatam Certificate - <Language>` without further
   code changes.
4. **Favicon**: still Next.js's default `favicon.ico` in
   `shatam-care-web/src/app/` — untouched.
