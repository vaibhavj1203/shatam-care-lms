# Shatam Care LMS — DocType Schema Design

Status: **design, being implemented now** into a new custom Frappe app
(`shatam_care`, see [PLAN.md](PLAN.md) section 5/task tracking). This extends
stock Frappe LMS's data model — see [PROJECT.md](PROJECT.md) for the baseline.

Convention: new DocTypes live in the `shatam_care` app so the upstream `lms`
fork stays pullable. Where we need to add a field to an *existing* `lms`
DocType (e.g. `Course Lesson`), we use Frappe **Custom Fields**, not edits to
the upstream JSON.

## Refinement vs. PLAN.md: batches dropped entirely, not repurposed

PLAN.md originally said "repurpose `LMS Batch` as an admin grouping tag."
Having now looked at `LMS Batch`'s actual fields, it's built around
scheduling/timetables/live-class enrollment we don't use at all — reusing it
means carrying dead fields for no benefit. Cleaner: **drop `LMS Batch` from
scope entirely** (add it to `REMOVAL_CANDIDATES.md`) and add a small new
`LMS Student Group` doctype purely for the region/coordinator reporting tag.
Same outcome, less baggage.

## New DocTypes (in `shatam_care` app)

### `LMS Video Checkpoint`
An in-video quiz checkpoint, authored by a teacher via the scrubber tool.

| Field | Type | Notes |
|---|---|---|
| lesson | Link → Course Lesson | required |
| course | Link → LMS Course | denormalized, matches existing convention (e.g. `LMS Quiz Submission.course`) |
| timestamp_seconds | Int | video position in seconds where playback pauses |
| label | Data | short marker label shown on the authoring timeline, e.g. "Checkpoint 1" |
| question_text | Text | the question shown when paused (English/default) |
| options | Table → `LMS Video Checkpoint Option` (new child doctype: `option_text` Data + `is_correct` Check) | answer choices |
| order | Int | display/sort order among checkpoints in the same lesson |

**Correction during implementation**: originally planned to reuse stock
`LMS Option`, but that doctype turns out to be dead code in the current
`lms` app version — `LMS Question` actually stores choices as flat
`option_1`..`option_4` fields, not a child table. `LMS Option` isn't
referenced anywhere. So checkpoints get their own small child doctype
instead (`LMS Video Checkpoint Option`), and `LMS Question Translation`
(below) was redesigned to mirror `LMS Question`'s real flat structure
rather than a table.

### `LMS Video Checkpoint Attempt`
Tracks whether a student has answered a checkpoint — existence of a record
for `(member, checkpoint)` is what triggers "first-watch already done, don't
re-enforce on rewatch" (per PLAN.md 3.3).

| Field | Type | Notes |
|---|---|---|
| checkpoint | Link → LMS Video Checkpoint | required |
| member | Link → User | required |
| lesson | Link → Course Lesson | denormalized |
| course | Link → LMS Course | denormalized |
| selected_option | Data | text of the option chosen (kept simple rather than linking a child row) |
| is_correct | Check | recorded but never blocks resuming (soft checkpoint, PLAN.md 3.3) |
| attempted_on | Datetime | |

Unique constraint on `(checkpoint, member)` — one attempt per student per
checkpoint, enforced in the controller (`validate`), not just a DB index,
since we need a clean "already attempted" check before deciding whether to
pause the video at all.

### `LMS Video Checkpoint Translation`
Per-language variant of a checkpoint's question text (video itself is
handled by YouTube's own dubbed audio tracks — see PLAN.md 3.2 — only text
needs variants).

| Field | Type | Notes |
|---|---|---|
| checkpoint | Link → LMS Video Checkpoint | required |
| language | Link → Language | reuses Frappe core's built-in `Language` doctype |
| question_text | Text | |
| options | Table → `LMS Video Checkpoint Option` | translated option text, matched to the original by row position — `is_correct` isn't re-entered per language, the count is validated to match the original |

### `LMS Question Translation`
Same pattern, for the *final assessment* question bank (`LMS Question`,
stock LMS doctype).

Mirrors `LMS Question`'s actual flat structure (not a child table — see
correction note above): `question_text` (Text Editor) plus `option_1`..
`option_4` and `explanation_1`..`explanation_4` (Small Text, translated
choice text/explanations — correctness flags stay on the original
`LMS Question`), and `possibility_1`..`possibility_4` (translated accepted
answers for "User Input" type questions).

| Field | Type | Notes |
|---|---|---|
| question | Link → LMS Question | required |
| language | Link → Language | |
| question_text | Text Editor | |
| option_1..option_4, explanation_1..explanation_4, possibility_1..possibility_4 | Small Text | translated text only, positionally matched to the original |

### `LMS Certificate Eligibility`
Replaces the *purpose* of stock `LMS Certificate Request` (which is built
around booking a live oral evaluation — see PROJECT.md/PLAN.md — a fundamental
mismatch). This is a new doctype rather than repurposing the old one, so we
don't drag along live-call fields (`day`, `start_time`, `google_meet_link`,
`timezone`) that mean nothing here.

| Field | Type | Notes |
|---|---|---|
| member | Link → User | required |
| course | Link → LMS Course | required |
| evaluator | Link → Course Evaluator | auto-filled from `course.evaluator` on creation |
| status | Select | `Pending Auto-Gate` / `Eligible - Pending Approval` / `Approved` / `Rejected` |
| all_lessons_completed | Check | computed from `LMS Course Progress` |
| all_checkpoints_passed | Check | computed from `LMS Video Checkpoint Attempt` coverage |
| final_assessment_submission | Link → LMS Quiz Submission | the passed final-assessment attempt |
| auto_gated_on | Datetime | when the system detected all criteria met |
| reviewed_by | Link → User | the evaluator who approved/rejected |
| reviewed_on | Datetime | |
| rejection_reason | Small Text | shown to student if rejected, they can retry the final assessment |
| certificate | Link → LMS Certificate | set once issued (stock doctype, extended below) |

A scheduled job (or a hook on `LMS Quiz Submission.on_submit` for the final
assessment) creates/updates this record and flips `status` to
`Eligible - Pending Approval` the moment all three gating conditions are true
— this is the "auto-gate" from PLAN.md 3.5 step 1.

### `LMS Student Group`
The admin-only regional/coordinator reporting tag (replaces the "repurpose
Batch" idea above).

| Field | Type | Notes |
|---|---|---|
| title | Data | e.g. "Nashik — Coordinator Priya" |
| region | Data | free-text district/city, or Link to a lightweight `Region` doctype if a fixed list is preferred later |
| coordinator | Link → User | optional |
| description | Small Text | optional |

Linked from students via a Custom Field, not the other way around (see
below) — a group is just a tag a student record points to.

## Custom Fields on existing (stock `lms`) DocTypes

| DocType | New field | Type | Purpose |
|---|---|---|---|
| `Course Lesson` | `review_status` | Select: Draft / Submitted for Review / Approved / Rejected (default Draft) | Content moderation (PLAN.md 3.6) |
| `Course Lesson` | `reviewed_by` | Link → User | |
| `Course Lesson` | `review_notes` | Small Text | admin feedback to teacher |
| `Course Lesson` | `submitted_on` / `reviewed_on` | Datetime | |
| `LMS Quiz` | `is_final_assessment` | Check | marks the one quiz per course that gates certificate eligibility; validated in controller (only one per course) |
| `LMS Enrollment` | `preferred_language` | Link → Language | drives which checkpoint/question translation and which certificate Print Format variant is used |
| `LMS Enrollment` | `student_group` | Link → LMS Student Group | admin reporting tag, optional |
| `LMS Certificate` | `certificate_uid` | Data, unique | public-facing short ID, e.g. `SCF-2026-000123` |
| `LMS Certificate` | `verification_url` | Data, read-only | auto-computed from `certificate_uid` |
| `LMS Certificate` | `qr_code` | Attach Image | generated at issue-time, encodes `verification_url` |

Note: `LMS Certificate` already has `evaluator` and `template` (Print Format)
fields — the `template` link is exactly the mechanism we'll use for
per-language certificate variants (one Print Format per language, selected
by the student's `preferred_language` at issue time), so no new
certificate-text-variant data model is needed.

## Public verification page

Not a DocType — a Frappe website route (`www/verify/<certificate_uid>.py` +
template) that does a permission-free, read-only lookup: given a
`certificate_uid`, show member name, course title, issue date, and a
"valid"/"not found" state. No auth required, since this is meant to be
checked by an employer/family member with no LMS account.

## Removed from scope (updates to REMOVAL_CANDIDATES.md)

Add to the removal list: `LMS Batch`, `LMS Batch Enrollment`,
`LMS Batch Timetable`, `LMS Batch Feedback`, `LMS Certificate Request`
(superseded by `LMS Certificate Eligibility` above), `LMS Certificate
Evaluation`, `Evaluator Schedule` (already flagged as part of live-class
removal, confirmed here as fully redundant given the new eligibility flow
doesn't use scheduling at all).
