# Shatam Care LMS — Features Marked for Removal

Status: **documentation only** — nothing below has been deleted from the codebase.
This is a reference list of what's redundant against the confirmed Shatam Care
requirements, to be acted on once implementation actually starts.

Decisions here are scoped against stock
[Frappe Learning](https://github.com/frappe/lms), the base architecture this
customization extends.

## Backend: DocTypes/apps to remove entirely

| Feature | DocTypes / app | Why it's out of scope |
|---|---|---|
| Payments / monetization (UI/flow only — see note) | `LMS Payment`, `LMS Coupon`, `LMS Coupon Item`, `Payment Country` | All courses are free (NGO-run, govt-recognized certification, no checkout flow) |
| Job board | `Job Opportunity`, `LMS Job Application` | Not part of the operating model — placement isn't a feature Shatam asked for |
| Programming exercises | `LMS Programming Exercise`, `LMS Test Case`, `LMS Test Case Submission` | Coding-exercise infrastructure, irrelevant to caregiving curriculum |
| Resume/profile builder | `Skills`, `User Skill`, `Work Experience`, `Education Detail`, `Preferred Function`, `Preferred Industry`, `Industry`, `Function` | Exists only to feed the job board; removed together with it |
| Live/synchronous classes | `LMS Live Class`, `LMS Live Class Participant`, `Zoom Settings`, `LMS Google Meet Settings`, `Evaluator Schedule` | All content is pre-recorded (YouTube, dubbed multi-language audio tracks) — no live sessions in this model |
| Public course reviews | `LMS Course Review` | Open public ratings don't fit a government-recognized certification program's tone/reputation profile |
| Gamification badges | `LMS Badge`, `LMS Badge Assignment` | The certificate itself is the credential that matters; no separate badge system requested |
| Multi-course programs | `LMS Program`, `LMS Program Course`, `LMS Program Member` | Not needed for standalone per-topic/per-language courses in v1 — may resurface later if Shatam wants to bundle e.g. "Basic" + "Advanced" into a combined track, but out of scope now |
| Batches (scheduling) | `LMS Batch`, `LMS Batch Enrollment`, `LMS Batch Timetable`, `LMS Batch Feedback` | **Revised during schema design (see `SCHEMA.md`)**: originally planned to repurpose as an admin grouping tag, but `LMS Batch`'s fields are entirely scheduling/timetable/live-class-oriented — no benefit to reusing it. Replaced by a new lightweight `LMS Student Group` doctype (title, region, coordinator) instead. |
| Certificate request/evaluation | `LMS Certificate Request`, `LMS Certificate Evaluation`, `Certification` | Superseded by the new `LMS Certificate Eligibility` doctype (see `SCHEMA.md`) — the old ones are built around booking a **live oral evaluation call** (`evaluator`, `date`, `start_time`, `end_time`, `google_meet_link`) which doesn't fit an auto-gated flow at all; cleaner to add a new doctype than strip the old one down |
| `Evaluator Schedule` | `Evaluator Schedule` | Confirmed fully redundant — the new eligibility flow has no scheduling concept |

**Note on the `payments` app**: discovered during implementation that `lms/hooks.py`
declares `required_apps = ["frappe/payments"]` — it's a hard structural
dependency, not an optional add-on, so literally uninstalling it risks breaking
`bench install-app lms`. Revised plan: keep `payments` installed, but hide every
payment-related field on `LMS Course`/`LMS Enrollment` (`paid_course`,
`course_price`, `amount_usd`, `paid_certificate`, etc.) via Property Setters
(`hidden: 1`), and simply never build frontend UI or call payment-related API
endpoints. Net effect for users is identical (no payment flow ever appears);
the difference is only that the dependency stays installed at the DB/app level.

## Backend: features to repurpose rather than remove

| Feature | DocType | What changes |
|---|---|---|
| Course Evaluator / Course Instructor | `Course Evaluator`, `Course Instructor` | Kept as-is structurally — evaluator role reused for the new certificate-approval step (already scoped per-course via `LMS Course.evaluator`), instructor role reused for the teacher persona |

## Frontend: full replacement, not a removal

The existing `shatam-care-lms/frontend/` Vue 3 SPA and `frappe-ui` vendored library
are **not being extended** — the plan is a fully custom **React/Next.js** frontend
built against Frappe's REST API (token-based auth, not session cookies), because
the UX needs (interactive video-scrubber for teacher-authored in-video quiz
checkpoints, low-digital-literacy-friendly student flows, custom branding) go well
beyond what a themed skin on the stock UI can deliver. The Vue frontend can stay in
the repo for reference during the backend/DocType work but won't ship.

## Net-new, not in stock Frappe LMS at all

For completeness — these aren't "removals," they're gaps the stock app doesn't
cover and that need to be built:

- Timestamp-gated in-video quiz checkpoints (pause-and-require-an-answer-to-resume
  on first watch only; skippable on rewatch)
- Auto-scored final assessment gating an approval queue (see certificate rework
  above)
- Per-language text variants for quiz questions + certificate (video itself is
  handled by YouTube's native multi-audio-track dubbing, not duplicated content)
- Certificate verification: unique ID + QR code + public lookup page
- Draft → admin-review → publish workflow for teacher-uploaded lessons
- Interactive video-scrubber authoring tool for teachers to place quiz checkpoints
