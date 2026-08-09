# Shatam Care LMS — Project Overview

## What this is

This is a **local Docker setup of Frappe Learning (LMS)**, an open-source Learning
Management System built on the Frappe Framework. The repo living in
`frappe/shatam-care-lms` is a fork (`vaibhavj1203/shatam-care-lms` on GitHub) of
[`frappe/lms`](https://github.com/frappe/lms), currently sitting on the unmodified
`develop` branch — no custom commits have been made yet. `frappe/docker-compose.yml`
and `frappe/init.sh` are the scaffolding that spins the whole stack up in Docker for
local development/evaluation.

The name suggests the intent: standing up a course/certification platform — likely
for training or certifying caregivers, given the adjacent research files in this
workspace (`Elder_Care_Platform_Research.docx`, `AlayaCare_API_Analysis.docx`). As of
now, no eldercare-specific customization exists — this document describes the stock
Frappe LMS product as currently checked out.

## End-to-end architecture

```
                 ┌────────────────────────────────────────────┐
                 │              docker-compose (lms)           │
                 │                                              │
   browser  ───► │  frappe/bench container (port 8000, 9000)   │
                 │    ├─ Frappe Framework (Python/MariaDB ORM)  │
                 │    ├─ LMS app (bench app "lms")              │
                 │    ├─ Payments app (bench app "payments")    │
                 │    └─ Vue 3 frontend (built into the site)   │
                 │                                              │
                 │  mariadb container (site database)           │
                 │  redis container (cache/queue/socketio)      │
                 └────────────────────────────────────────────┘
```

- **Backend**: Frappe Framework — a Python full-stack framework that auto-generates
  REST APIs, an admin UI, and forms from "DocType" schema definitions stored as JSON.
  All business logic lives as Python controllers per DocType plus whitelisted API
  methods.
- **Database**: MariaDB 10.8, one database per "site" (`lms.localhost`).
- **Cache/Queue/Realtime**: Redis, used for caching, background jobs, and Socket.IO
  (live class notifications, progress updates).
- **Frontend**: A Vue 3 SPA (`frontend/`) using `frappe-ui` (Frappe's Vue component
  library, vendored here as a submodule) that talks to the backend over Frappe's
  auto-generated REST/RPC API.
- **Payments**: The `payments` Frappe app is installed alongside `lms` to handle paid
  course/batch enrollments.

## How it runs (local dev via Docker)

1. `docker compose up` (using `frappe/docker-compose.yml`) starts three containers:
   `mariadb`, `redis`, and `frappe` (the `frappe/bench:latest` image).
2. The `frappe` container runs `frappe/init.sh` on first boot, which:
   - Creates a new bench (`bench init frappe-bench`), pointed at the `mariadb` and
     `redis` containers instead of localhost.
   - Fetches the `payments` and `lms` apps (`bench get-app`).
   - Creates a new site `lms.localhost` with root/admin credentials (`123` / `admin`).
   - Installs `payments` and `lms` onto that site, enables developer mode, clears
     cache, and runs `bench start` (which boots the web server, background workers,
     and file watchers via the bench `Procfile`).
   - On subsequent restarts, if a bench already exists it skips straight to
     `bench start`.
3. The site becomes available at `http://lms.localhost:8000/lms` with login
   `Administrator` / `admin`.

## Core data model (DocTypes)

The domain model lives under `lms/lms/doctype/`. The key entities:

- **Course structure**: `LMS Course` → `Course Chapter` → `Course Lesson` (a strict
  3-level hierarchy: course > chapter > lesson).
- **Delivery**: `LMS Batch` groups learners around a course/cohort with a schedule
  (`LMS Batch Timetable`, `Evaluator Schedule`), live classes over Zoom or Google Meet
  (`LMS Live Class`, `Zoom Settings`, `LMS Google Meet Settings`), and enrollment
  (`LMS Batch Enrollment`, `LMS Enrollment`).
- **Assessment**: Quizzes (`LMS Quiz`, `LMS Quiz Question`, `LMS Quiz Submission`,
  `LMS Quiz Result`), assignments (`LMS Assignment`, `LMS Assignment Submission`),
  and programming exercises with auto-graded test cases (`LMS Programming Exercise`,
  `LMS Test Case`, `LMS Test Case Submission`).
- **Certification**: `LMS Certificate`, `LMS Certificate Request`,
  `LMS Certificate Evaluation`, `Certification` — course/batch completion issues a
  certificate from a customizable print template.
- **Programs**: `LMS Program` bundles multiple courses into a longer learning path
  (`LMS Program Course`, `LMS Program Member`).
- **Engagement/social**: badges (`LMS Badge`, `LMS Badge Assignment`), course reviews
  (`LMS Course Review`), lesson notes (`LMS Lesson Note`), skills/profile fields
  (`Skills`, `User Skill`, `Work Experience`, `Education Detail`), coupons for paid
  courses (`LMS Coupon`, `LMS Coupon Item`), and a job board module
  (`lms/job/doctype`: `Job Opportunity`, `LMS Job Application`) for course graduates.
- **Payments**: `LMS Payment` ties into the `payments` app for checkout on paid
  courses/batches.

## User-facing features (what someone using the deployed app can do)

1. **As an admin/instructor**: create a course, structure it into chapters and
   lessons (video, text, or embedded content), optionally group learners into a
   scheduled batch with live Zoom/Meet sessions, attach quizzes/assignments/coding
   exercises, set pricing and coupons, and issue certificates on completion.
2. **As a learner**: browse/search courses, enroll (free or paid via the payments
   app), progress through chapters/lessons with tracked video-watch duration and
   progress (`LMS Course Progress`, `LMS Video Watch Duration`), join scheduled live
   classes, take quizzes/submit assignments/solve programming exercises, receive
   feedback and a certificate on completion, leave a course review, and browse job
   postings tied to the platform.
3. **Cross-cutting**: multi-language support (`lms/translations`, `.pot` files,
   Crowdin integration), notifications and email templates
   (`lms/lms/notification`, `lms/templates/emails`), and a REST API surface
   auto-generated by Frappe for every DocType plus custom whitelisted endpoints.

## Repo layout cheat-sheet

- `frappe/docker-compose.yml`, `frappe/init.sh` — local Docker bootstrap (outside the
  app repo itself).
- `shatam-care-lms/lms/` — the Frappe app: DocTypes, server-side Python, fixtures,
  patches (DB migrations), print formats, email templates, workspace/dashboard
  config.
- `shatam-care-lms/frontend/` — the Vue 3 SPA (pages for Courses, Batches, Programs,
  Programming Exercises, Search, plus shared components/stores/utils).
- `shatam-care-lms/frappe-ui/` — vendored Frappe UI component library (git submodule).
- `shatam-care-lms/cypress/` — end-to-end test suite.
- `shatam-care-lms/lms/patches/` — versioned schema/data migrations (`v0_0`, `v1_0`,
  `v2_0`), run automatically on `bench migrate`.

## Current state / what's next

- The fork is at the tip of upstream `develop` (last pulled commits include security
  fixes for assignment-submission auth and evaluator-batch authorization) with **no
  local modifications** — it's a clean base, not yet adapted for a specific business.
- Nothing in this repo currently references "Shatam Care" or elder care beyond the
  fork's name — any caregiver-training-specific customization (branding, custom
  DocTypes, certification rules tied to eldercare compliance, etc.) is still to be
  designed and built on top of this base.
