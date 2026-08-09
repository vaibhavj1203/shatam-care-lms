# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A customized LMS for **Shatam Care Foundation**, an NGO that trains caregivers in
tier-3 Indian cities and villages via pre-recorded YouTube lessons, tests them, and
issues government-recognized (but self-issued, not government-integrated) certificates.

Three components live side by side in `frappe/`:

| Directory | What it is | Editable? |
|---|---|---|
| `shatam-care-lms/` | Fork of upstream [frappe/lms](https://github.com/frappe/lms), on `develop`, **unmodified** | Avoid — keep pullable |
| `shatam_care/` | Our custom Frappe app; all backend customization lives here | Yes |
| `shatam-care-web/` | Our custom Next.js frontend, replaces the stock Vue UI entirely | Yes |

**Read `PLAN.md` before making design decisions.** It records ~22 locked-in choices
from a requirements interview (why certificates need human approval, why checkpoints
only enforce on first watch, why there are no batches, etc.). `SCHEMA.md` documents
the data model and, importantly, records where the implementation *diverged* from
the original plan and why.

## Critical architectural constraints

**Never edit `shatam-care-lms/`.** It's an upstream fork kept clean so it can be
pulled. All customization goes in `shatam_care/`:
- New DocTypes → `shatam_care/shatam_care/doctype/`
- Fields on stock doctypes → Custom Fields in `shatam_care/fixtures/custom_field.json`
- Hiding stock fields → Property Setters in `shatam_care/fixtures/property_setter.json`

**Reuse stock LMS logic rather than reimplementing it.** Quiz delivery and scoring
already exist upstream (`lms.lms.utils.get_quiz_with_questions`,
`lms.lms.doctype.lms_quiz.lms_quiz.submit_quiz` — handles multi-choice, fuzzy user
input, negative marking). `assessment.py` is a thin wrapper over these precisely so
there aren't two scoring paths that can drift.

**The `payments` app cannot be uninstalled.** `lms/hooks.py` declares it in
`required_apps`. It stays installed with every payment field hidden via property
setters. See `REMOVAL_CANDIDATES.md` for the full list of stock features
deliberately excluded (job board, live classes, badges, programs, batches, reviews).

**Frontend and backend are fully decoupled.** Different origins, token auth
(`Authorization: token <api_key>:<api_secret>`), not session cookies. Frappe has no
native password→token login for end users, so `auth.py::login_and_get_token`
bridges it: authenticate server-side, mint/rotate the user's api key+secret, return
them, drop the session.

## Backend (`shatam_care/`)

Module responsibilities — business logic stays out of `api.py`, which is only the
HTTP surface:

- `certificate_eligibility.py` — the auto-gate. Fires from `doc_events` hooks when
  progress or a quiz submission changes; flips a learner to
  `Eligible - Pending Approval` once all lessons + all checkpoints + a passing final
  assessment exist. Also holds evaluator approve/reject.
- `certificate_issuance.py` — UID (`SCF-YYYY-NNNNNN`), QR, per-language print format.
- `assessment.py` — final assessment lookup/submit (wraps stock LMS).
- `translations.py` — overlays per-language text onto checkpoints and questions.
- `content_review.py` — Draft → Submitted → Approved/Rejected for teacher lessons.
- `admin_api.py` — course/instructor/evaluator/student management, admin-gated.
- `permissions.py` — row-level visibility for `LMS Certificate Eligibility`.
- `www/verify/` — public, auth-free certificate lookup at `/verify?id=<uid>`.

Personas map onto **roles that already exist in stock LMS** (see `lms/install.py`) —
no new roles were invented. `Moderator`=admin, `Course Creator`=teacher,
`Batch Evaluator`=evaluator, `LMS Student`=student. The mapping is mirrored in
`shatam-care-web/src/lib/roles.ts`.

### Non-obvious behaviours worth knowing

- **Checkpoint answers submit by index, not text.** A learner viewing a translated
  checkpoint would otherwise submit translated text that never matches the stored
  originals, marking every answer wrong. Index also keeps stored answers in one
  canonical language for reporting.
- **`LMS Quiz Submission.course` is auto-fetched from `quiz.course`.** A final
  assessment quiz created without `course` set will silently never certify anyone,
  because the eligibility gate reads that field.
- **Checkpoint/question translations don't restate correctness.** Options are matched
  positionally to the original; `is_correct` lives only on the original.
- **`LMS Option` in stock LMS is dead code.** `LMS Question` uses flat
  `option_1..option_4` / `is_correct_1..4` fields. Don't build against `LMS Option`.

## Frontend (`shatam-care-web/`)

```bash
npm run dev      # dev server
npm run build    # production build — the real check; runs tsc
npx tsc --noEmit # types only
npx eslint src   # lint
```

There are no automated tests in this project. `npm run build` plus browser
verification is the verification loop.

**Next.js 16 / React 19 — the installed version has breaking changes vs. training
data.** `AGENTS.md` in that directory says to read `node_modules/next/dist/docs/`
before writing code; do that. Two that bite immediately:
- Dynamic route `params` is a `Promise` — unwrap with React's `use()`.
- The React Compiler lint rules reject `setState` directly in an effect body and
  use-before-declare in effects. These catch real bugs; fix rather than suppress.

Structure: `src/app/(app)/` is a route group whose layout enforces the auth guard
and role-based nav — **new authenticated pages belong inside it**. `/login` sits
outside. `src/lib/frappe-client.ts` is the transport layer (token storage, REST/RPC
helpers); `src/lib/lms-api.ts` is the typed domain layer that pages call.

**Auth uses `useSyncExternalStore` plus an explicit `ready` flag.** The flag is not
redundant: the SSR-matching first render always sees `user = null`, so a route guard
that redirects before `ready` bounces already-logged-in users to `/login` on every
hard refresh. This was a real bug caught by testing.

## Running it

Docker is the chosen route. A native bench install was attempted and deliberately
reverted — it required changing system-wide `python3` and `node` defaults. See
`SYSTEM_CHANGES.md`.

```bash
cd frappe && docker compose up      # first run 10-20+ min
cd shatam-care-web && npm run dev   # separate terminal
```

**Prerequisite:** Docker Desktop needs Documents-folder access in System Settings →
Privacy & Security → Files and Folders, or the bind mount fails with
`operation not permitted` (macOS TCC).

Backend desk UI: `http://lms.localhost:8000/app` (`Administrator` / `admin`).
`init.sh` provisions the bench, apps, site, `developer_mode` and `allow_cors`.

Frappe `develop` requires Python >=3.14 and Node >=24. If `init.sh` fails inside the
container with a bare `SyntaxError: invalid syntax` or
`engine "node" is incompatible`, the bench image is older than `develop` needs — pin
`--frappe-branch version-15` instead. `lms/.github/workflows/ci.yml` is the
authoritative source for intended toolchain versions.

### Backend changes require a migrate

DocType JSON, custom fields and property setters are only applied by:
```bash
docker compose exec frappe bench --site lms.localhost migrate
docker compose exec frappe bench --site lms.localhost clear-cache
```
Python changes are picked up on reload in developer mode.

## Current state

**The backend has never successfully executed against a live database.** It is
written against the real stock schema and py-compiles, but expect genuine errors on
first migrate — doctype JSON, fixture ordering, permission edge cases. `STATUS.md`
tracks what's implemented, what's verified, and known gaps (no assessment-question
translation UI, wkhtmltopdf absent so certificate PDF download fails, placeholder
branding).
