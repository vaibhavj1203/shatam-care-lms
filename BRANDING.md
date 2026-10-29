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
- **Certificate template**: the "Shatam Certificate" Print Format
  (`shatam_care/print_format/shatam_certificate/`), with an admin-uploadable
  background (see below). It replaced the stock `lms` `Certificate` format,
  which is only a fallback if the Shatam one is missing. Certificates must
  never use the generic "Standard" Frappe print format (see
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
3. **Certificate design**: an admin uploads the background image in the web
   app (Certificate template, `/admin/certificates`): A4 landscape PNG/JPG,
   ideally 3508 x 2480 px, with the centre left empty. The built-in default is
   `shatam_care/public/images/certificate-background-default.png`. The learner
   details are printed over it by the "Shatam Certificate" Print Format; to
   move or add fields, edit that Print Format
   (`shatam_care/print_format/shatam_certificate/`) and keep it in step with
   the design.
4. **Favicon**: still Next.js's default `favicon.ico` in
   `shatam-care-web/src/app/` — untouched.
