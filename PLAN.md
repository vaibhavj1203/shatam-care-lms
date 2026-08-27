# Shatam Care LMS — Build Plan

Status: **plan, not yet implemented**. This consolidates everything locked in
during the grill session (2026-07-29/30) into one reference document. See also
[upstream Frappe Learning](https://github.com/frappe/lms) (the stock
architecture/data model this is scoped against) and
[`REMOVAL_CANDIDATES.md`](REMOVAL_CANDIDATES.md) (features
marked for removal, not yet deleted).

## 1. What this is

A customized LMS for **Shatam Care Foundation**, an NGO providing geriatric
at-home care, to train people in tier-3 cities and villages on geriatric
caregiving via pre-recorded (YouTube-hosted) video content, test their
understanding, and issue government-recognized certificates on completion —
all issued under Shatam's own authority, with no external government system
integration.

## 2. Personas

> **Revised 2026-08-12.** The original four personas (Admin, Teacher, Evaluator,
> Student) became three. The separate Teacher persona was dropped — admins author
> content themselves — and Evaluator stopped being a fixed job. An evaluator now
> holds only the rights an admin delegates, chosen per person from five
> capabilities: manage courses, author content, review content, approve
> certificates, manage people. Two evaluators at different centres can therefore
> be trusted with quite different things.
>
> Consequence worth stating plainly: Q12 originally separated evaluator from
> teacher so nobody could approve certificates for content they authored. With
> delegation, an admin *can* grant both to one person. The safeguard is now a
> matter of policy rather than something the system enforces.


| Persona | What they can do |
|---|---|
| **Admin** | Everything, implicitly. Authors content, runs courses, approves certificates, manages accounts. |
| **Evaluator** | Only what an admin delegates, per person: any subset of `courses`, `content`, `review`, `certificates`, `people`. Two evaluators may hold entirely different sets. |
| **Student** | Enrols, watches and rewatches lessons, answers in-video checkpoints, takes the final assessment, receives a certificate. |

Capabilities are stored per user (`User.shatam_capabilities`), not per role,
because two evaluators at different centres are legitimately trusted with
different things. `capabilities.py` is the single definition; every gated API
calls `check_capability()`.

Frappe's own doctype-role permissions are deliberately **not** a second gate on
these paths — capability checks are the authorisation boundary, and writes
behind them run with `ignore_permissions=True`. Leaving both active meant the
capability layer said yes and the write then failed for anyone who wasn't a
full admin.

## 3. Core flows

### 3.1 Course structure
Course → Chapter → Lesson (stock Frappe LMS hierarchy, unchanged). Each lesson
embeds one YouTube video.

### 3.2 Language handling
Content is multi-lingual (English, Hindi, Marathi, + more). Production model:
**the same recording is dubbed into multiple audio tracks** on a single YouTube
video (not separately taught per-language content). Consequences:
- One course/lesson per topic — **not** duplicated per language.
- Video language is handled by YouTube's own multi-audio-track switching.
- **Open risk**: YouTube IFrame API's support for *programmatically* forcing a
  specific audio track is unconfirmed/likely unreliable — may require a
  one-time UI prompt telling the student to pick their language from the
  native player's settings icon, rather than the LMS silently forcing it.
- Only **quiz question text and certificate text** need per-language variants
  (scoped to a lightweight text-variant layer, not full content duplication)
  — student's language preference is stored on their profile/enrollment.

### 3.3 In-video quizzes (attendance/engagement proof)
- Teacher places quiz checkpoints at specific video timestamps using an
  **interactive scrubber tool**: embed the YouTube player in an authoring
  view, teacher scrubs/plays to the moment, clicks "add quiz here," timestamp
  captured automatically from the player's current position; checkpoints shown
  as editable markers on a timeline.
- At playback, video **pauses at the checkpoint and requires an answer (right
  or wrong) to resume** — a "soft checkpoint," not a hard block. Wrong answers
  are recorded but don't prevent resuming. No anti-seek/scrubber-lockdown.
- Checkpoints **only enforce on the first watch-through**. Once a student has
  passed through a lesson's checkpoints once, rewatching for review plays
  straight through with no interruptions.
- This mechanism **is** the attendance/engagement-proof system — no separate
  calendar-based attendance register. "Attendance" = derived from lesson
  completion + in-video quiz interaction, since the courses are self-paced.

### 3.4 Final assessment
- One auto-scored quiz per course, gating certificate eligibility, taken after
  all lessons + in-video quizzes are completed.
- **v1 scope: pure MCQ/auto-scored only.** Explicitly designed to extend later
  (v2) to a mix of auto-scored + evaluator-reviewed open-ended/scenario
  questions, without a redesign — not building that now.

### 3.5 Certificate issuance
1. System auto-detects: all lessons watched + all in-video quizzes passed +
   final assessment passed.
2. Routes to that course's assigned **Evaluator** for a lightweight
   approve/reject review (not a scheduled call — replaces stock LMS's
   live-oral-evaluation-booking flow entirely).
3. On approval, certificate auto-issued: uses a provided govt-style template,
   carries a **unique certificate ID + QR code** linking to a public
   verification page (`shatamcare.../verify/<id>` type URL) where anyone can
   confirm the certificate is genuine — since no external government registry
   exists to check against otherwise.
4. Certificate authority is Shatam Care itself; no external government API,
   reporting, or approval step involved at any stage.

### 3.6 Content moderation
Teacher-authored lessons/chapters go through **draft → admin review →
publish**. Nothing teacher-uploaded reaches students unreviewed, given the
certificate this content ultimately supports carries government-recognized
weight.

### 3.7 Enrollment
Self-service signup (student creates their own account) **with manual admin
fallback** — an admin can create a student account/enrollment on someone's
behalf when needed. No dedicated bulk-registration or phone-OTP coordinator
workflow in v1; revisit only if self-service proves to be a real field barrier.

### 3.8 Student/admin grouping
No batches/cohorts in the student-facing experience (no scheduling, no
enrollment windows — fully flat "enroll in a course, go at your own pace").
Stock LMS's `LMS Batch` is **repurposed** purely as an **admin-facing
regional/coordinator tag** for reporting (e.g. "students in this district"),
invisible to the student experience.

## 4. What's removed vs. kept

Full detail in [`REMOVAL_CANDIDATES.md`](REMOVAL_CANDIDATES.md). Summary:

**Removed**: payments/monetization, job board, programming exercises,
resume/profile-builder fields, live classes (Zoom/Meet/live attendance),
public course reviews, badges, multi-course programs.

**Repurposed, not removed**: `Course Evaluator`/`Course Instructor` (kept,
reused as designed — `LMS Course` already has a per-course `evaluator` link
field natively). `LMS Batch` and `LMS Certificate Request`/`Evaluation` were
originally slated for repurposing but on schema design turned out to carry
too much scheduling/live-call baggage to reuse cleanly — replaced by new,
purpose-built doctypes instead (`LMS Student Group`, `LMS Certificate
Eligibility`). Full field-level schema in [`SCHEMA.md`](SCHEMA.md).

## 5. Architecture

- **Backend**: Frappe Framework + `lms` app, used purely as an API layer
  (DocTypes, business logic, auth). Stock Vue 3 `frontend/` app is **set
  aside, not extended**.
- **Frontend**: fully custom **React/Next.js** app built against Frappe's
  REST API — chosen over extending the stock Vue frontend because the UX
  needs (interactive quiz-timestamp scrubber, low-digital-literacy-friendly
  flows, full custom branding) go well beyond a themed skin, and Next.js
  matches the stack used across other active projects for long-term
  maintainability.
- **Auth**: token-based (Frappe API key/secret), not session cookies —
  required since frontend and backend are decoupled and likely hosted
  separately (avoids cross-domain cookie complexity). Frappe's native token
  auth is a fixed, admin-issued credential with no built-in password-login
  flow for end users, so a bridge endpoint
  (`shatam_care.shatam_care.auth.login_and_get_token`) authenticates with
  username/password once server-side, mints/rotates that user's api_key/
  api_secret, hands it back as the bearer token, and immediately drops the
  session — every subsequent request uses
  `Authorization: token <api_key>:<api_secret>`.
- **Hosting**: start **self-managed VPS/Docker**, reusing the existing
  `docker-compose.yml`/`init.sh` as a base — cheapest option for an NGO budget.
  Built to stay close to stock Frappe conventions specifically so a **later
  migration to Frappe Cloud** (once ops burden becomes real) is
  straightforward, not a rebuild.
- **Scale target**: pilot scale (tens to low hundreds of students) — no
  premature optimization for thousands of concurrent users.

## 6. Net-new engineering (doesn't exist in stock Frappe LMS)

- Timestamp-gated in-video quiz checkpoints (pause/resume-on-answer, first-
  watch-only enforcement)
- Interactive video-scrubber authoring tool for teachers
- Auto-gated certificate approval queue (replacing live-call booking)
- Certificate verification: unique ID + QR + public lookup page
- Per-language text variants for quiz questions + certificate (video language
  handled by YouTube natively)
- Draft → review → publish workflow for teacher content
- Full custom React/Next.js frontend + token-based auth wiring against Frappe

## 7. Open items for the next planning pass

These came up during the grill session but weren't fully resolved — worth
addressing before/during implementation, not blocking the plan as a whole:

- ~~**Data residency/PII handling**~~ **RESOLVED**: host the self-managed VPS
  in an India region (e.g., DigitalOcean Bangalore/Mumbai region, or an
  India-based provider) — student PII (name, phone, location, course
  progress) stays in-region, and it's the lowest-latency choice for the
  actual user base. No specific external privacy regulation was named as a
  driver; this is a sensible default, revisit if a funder/government
  partner imposes a specific requirement later.
- ~~**YouTube audio-track auto-selection**~~ **RESOLVED (via web search,
  2026-07-30)**: confirmed there is no IFrame Player API method to
  programmatically select/force a viewer's audio track — audio-track
  switching is only exposed as a manual action in YouTube's own player
  settings (gear icon). Design decision: show a one-time, dismissible prompt
  ("Tap the settings icon and choose your language") the first time a
  student opens a lesson, rather than attempting to force it. No further
  spike needed.
- ~~**DocType schema design**~~ **RESOLVED** — full field-level design in
  [`SCHEMA.md`](SCHEMA.md), now being implemented as the `shatam_care` app.
- **Teacher-authoring UX beyond quiz placement**: chapter/lesson creation
  flow, YouTube link/video attachment, and how draft review surfaces to admins
  haven't been detailed yet.
- **Branding assets**: logo, color palette, certificate template file — noted
  as "to be provided" but not yet in hand.

## 8. Suggested next step

Detailed DocType/schema design for the reworked certificate flow and the new
in-video-quiz-checkpoint model, since almost everything else in this plan
(evaluator approval, verification, attendance-via-engagement) hinges on how
those two data models are shaped.
