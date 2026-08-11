# Shatam Care LMS — Implementation Status

Last updated: 2026-08-05. Companion to [PLAN.md](PLAN.md) (design decisions) and
[SCHEMA.md](SCHEMA.md) (data model).

## Everything implemented

### Backend — `shatam_care/` (custom Frappe app)

| Area | Files | What it does |
|---|---|---|
| Data model | `doctype/*` (7 doctypes) | Video checkpoints + options + attempts + translations, question translations, certificate eligibility, student groups |
| Schema extensions | `fixtures/custom_field.json` | Lesson review status, `is_final_assessment` on quizzes, enrollment language + group, certificate UID/QR/verification URL |
| Payment hiding | `fixtures/property_setter.json` | Hides all pricing fields (payments app stays installed — hard dependency of `lms`) |
| Auth | `auth.py` | Password login → API key/secret bridge (Frappe has no native end-user token login) |
| Certificate gating | `certificate_eligibility.py` | Auto-gate on lessons + checkpoints + passed assessment; evaluator approve/reject |
| Certificate issuance | `certificate_issuance.py` | Unique UID (`SCF-YYYY-NNNNNN`), QR code, per-language print format selection |
| Content review | `content_review.py` | Draft → Submitted → Approved/Rejected, reviewer-role enforced |
| Translations | `translations.py` | Overlays per-language text for checkpoints and assessment questions |
| Final assessment | `assessment.py` | Wraps stock `get_quiz_with_questions` / `submit_quiz`; enforces enrollment + attempt limits |
| Admin management | `admin_api.py` | Course CRUD, instructors, evaluators, assessment builder, student registration + enrollment |
| Learner/teacher API | `api.py` | Checkpoints, attempts, review queues, checkpoint editing, translations, certificates |
| Public verification | `www/verify/` | Auth-free certificate lookup by UID |
| Branding | `install.py` | Sets Website Settings app name (feeds certificate template) |

### Frontend — `shatam-care-web/` (Next.js 16 + React 19), 17 routes

**Student:** browse/enroll (`/courses`, `/courses/[id]`), video player with pause-and-answer
checkpoints (`/courses/[id]/lessons/[lessonId]`), **final assessment**
(`/courses/[id]/assessment`), language preference, certificate status,
certificates list with PDF download (`/certificates`).

**Teacher:** course/lesson list with review badges (`/teach`), lesson authoring with
interactive video scrubber, checkpoint create/edit/delete, per-language translation
editor, submit-for-review (`/teach/lessons/[lessonId]`).

**Admin:** course list/create (`/admin/courses`), course detail — publish, assign
teachers, assign evaluator, build final assessment with questions
(`/admin/courses/[id]`), student registration + enrollment + progress
(`/admin/students`), student groups (`/admin/groups`), content review queue
(`/admin/reviews`).

**Evaluator:** certificate approval queue (`/evaluate`).

## Verification status

- ✅ **Backend runs and the full flow passes end-to-end.** `smoke-test.py` walks
  admin → teacher → student → evaluator → public verification over the real HTTP
  API: **33/33 checks pass**, ending in an issued certificate resolving on the
  public `/verify` page.
- ✅ Frontend verified against the live backend in a browser **as both an admin
  and a student**: real token login, correct role-gated navigation, admin course
  list, student catalogue and student course page (chapters, lessons, language
  selector, assessment card) all rendering real data, no console errors.
- ⚠️ **Not browser-verified**: the in-video checkpoint overlay firing during
  playback, the assessment submission screen, and the certificates page. Their
  APIs are covered by the smoke test, but the player UI has not been driven
  against a real YouTube video — the local preview harness became too unstable
  to continue. This is the main remaining manual check.
- ✅ `tsc --noEmit` clean, `eslint` clean, `npm run build` succeeds (17 routes)

### Defects the first live run exposed (all fixed)

These are the reason "written and compiles" was never the same as "works":

1. **`property_setter.json` missing mandatory `doctype_or_field`** — aborted
   `install-app` partway, leaving the app half-installed.
2. **`LMSCertificateEligibility.has_permission` shadowed `Document.has_permission`**
   without honouring `flags.ignore_permissions`, silently disabling
   `ignore_permissions=True` for that doctype. The auto-gate runs inside hooks
   fired by *student* actions and students correctly have no write access, so the
   gate could never record eligibility. The most serious bug found.
3. **`doc.save(ignore_permissions=True)` doesn't cover inserts** — `save()` routes
   to `insert()`, which re-runs its own check and ignores the kwarg. Now set on
   the document.
4. **Frontend unwrapped only `{message}`** — Frappe returns `{data}` from
   `/api/resource/*`, so every `getList`/`getDoc`/`createDoc` returned the wrapper
   object instead of the payload (`rows.map is not a function`). Would have broken
   most pages.
5. **Lesson completion wrote `LMS Course Progress` directly** — 403 for students,
   and skipped stock LMS's enrollment bookkeeping. Now calls the whitelisted
   `save_progress`.
6. **`create_course` omitted mandatory `instructors`.**
7. **`www/verify` was one directory too deep**, so `/verify` 404'd.

### Further defects found by driving the app as a *student*

Logging in as an actual learner (rather than an admin) exposed five more — every
one of them invisible from the admin's view:

8. **Students cannot read `Course Lesson`.** Stock lms grants read only to
   System Manager / Course Creator / Moderator, so the course page and lesson
   player 403'd for learners while working perfectly for admins. Added
   `content.py` with enrollment-checked whitelisted reads.
9. **`Chapter Reference` / `Lesson Reference` rows were never created.** Setting
   the `course`/`chapter` link fields is not enough; nothing backfills the child
   tables, and every stock lms feature that walks a course (outline, next/prev
   lesson, progress recalculation) reads them. Our content was invisible to
   stock lms. Creation now writes them; 9 chapters and 8 lessons were backfilled.
10. **The admin's pass mark was silently replaced with 100%.** `LMSQuiz`
    forces `passing_percentage = 100` whenever a quiz has no questions — always
    true at creation — so every course secretly demanded a perfect score.
11. **Logging in signed you out everywhere else.** `login_and_get_token`
    rotated `api_secret` on every login, invalidating all other sessions for
    that user. Now reuses the existing credential.
12. **Dynamic route params arrive still percent-encoded.** Lesson names contain
    spaces and colons, so the raw param never matched a document and lookups
    returned "not found" for records that plainly existed. Added
    `lib/route-params.ts` and applied it to all five dynamic routes.

### Environment issues fixed (not product bugs)

- `bench serve` binds `127.0.0.1`, unreachable through a published container port —
  the app answers inside the container while the host gets a connection reset.
  `init.sh` now forces `--host 0.0.0.0`.
- `bench get-app` aborted registering `shatam_care` in `apps.txt` when its (no-op)
  asset build was SIGTERM'd.
- CORS must list the frontend origin or the browser blocks calls that succeed
  identically from curl — easy to misread as an auth failure.

## Not done yet (as of 2026-08-08)

Ranked by what blocks a real pilot:

1. **No self-service signup.** `/login` is the only public route. PLAN 3.7 chose
   self-service *with* admin fallback; only the fallback exists, so a learner
   cannot create their own account.
2. **The removals were never applied.** All 7 doctypes in
   `REMOVAL_CANDIDATES.md` (job board, programming exercises, badges, programs,
   reviews, live classes, batches) are still installed and visible in Frappe's
   desk. They're absent from our frontend, but the document describes a plan,
   not a completed action.
3. **Real branding.** Placeholder green; no logo file; certificates use stock
   lms's template rather than Shatam's government-approved design. Both assets
   still outstanding — see BRANDING.md for the swap-in points.
4. **Not deployed.** India-region VPS decided, never provisioned. Runs only on
   this machine.
6. Smaller: no authoring UI for assessment-question translations (checkpoint
   translations have one); courses can't be renamed after creation; lessons
   can't be reordered or deleted; students can't change group after
   registration; no automated tests beyond `smoke-test.py`; no CI.

## Known gaps

1. **⚠️ The bench is NOT on a volume.** Only the database is (`lms_mariadb-data`).
   The entire bench — apps, venv, site config — lives in the container's writable
   layer. **`docker compose down` destroys ~30 minutes of setup while leaving the
   database behind**, which is worse than starting clean. Use
   `docker compose restart frappe`; only run `down` if you also
   `docker volume rm lms_mariadb-data` and intend a full rebuild. Adding a named
   volume for `/home/frappe` is worth doing, but requires recreating the container.
2. **Not yet exercised in the browser**: the in-video checkpoint overlay and the
   teacher's video-scrubber both need a real YouTube video and manual playback;
   the smoke test covers their APIs but not the player UI.
3. ~~wkhtmltopdf missing~~ **Not an issue.** The `frappe/bench` image ships
   wkhtmltopdf 0.12.6.1 (patched Qt) and certificate PDF download works. Earlier
   docs claimed otherwise — that caveat came from the *native macOS* attempt,
   where the Homebrew formula is gone, and was wrongly carried over to Docker.
4. **Assessment question translations have no authoring UI.** The backend applies
   `LMS Question Translation` when it exists, and checkpoint translations *do* have a
   UI, but assessment questions must currently be translated via Frappe desk.
5. **Open-ended assessment questions** are out of scope by design (PLAN.md 3.4 — v1 is
   auto-scored MCQ only). Stock `submit_quiz` supports them; our admin builder only
   creates `Choices` questions.
6. **Branding is placeholder** (see BRANDING.md) — green palette, no logo file yet.
7. **No automated tests.**

## Running it locally — Docker

**Docker is the chosen route.** A native bench install was attempted and
deliberately abandoned: it required changing system-wide `python3` (3.9 → 3.14)
and `node` (v20 → v22) defaults, which affects unrelated projects on this
machine, plus a permanently running MariaDB service. All of that was fully
reverted — see [SYSTEM_CHANGES.md](SYSTEM_CHANGES.md). Docker keeps every one of
those dependencies inside containers instead.

**One-time prerequisite:** grant Docker Desktop access to your Documents folder
in System Settings → Privacy & Security → Files and Folders. Without it,
`docker compose up` fails with
`error while creating mount source path ... operation not permitted`, because
macOS TCC blocks Docker's mount helper from `~/Documents`.

```bash
cd frappe
docker compose up          # first run takes 10-20+ min
```

`init.sh` (run inside the container) creates the bench, fetches `payments`,
the local `lms` fork and `shatam_care`, creates the `lms.localhost` site,
installs all three apps, and enables developer mode.

Then, still needed after the site is up:

```bash
# CORS — the Next.js frontend is a separate origin using token auth
docker compose exec frappe bench --site lms.localhost set-config allow_cors http://localhost:3000
```

Frontend:
```bash
cd shatam-care-web && npm run dev
```

## Recommended first-run sequence

1. Run `setup-local.sh` (or `docker compose up`).
2. Fix whatever `bench migrate` / `install-app` surfaces.
3. Start the frontend: `cd shatam-care-web && npm run dev`.
4. As Administrator: create a course → assign a teacher → assign an evaluator →
   create the final assessment and add questions → publish.
5. As teacher: add a lesson with a YouTube URL → place checkpoints → submit for review.
6. As admin: approve the lesson.
7. As student: enroll → watch → answer checkpoints → take assessment.
8. As evaluator: approve the certificate.
9. Verify the certificate at `/verify?id=SCF-...`.
