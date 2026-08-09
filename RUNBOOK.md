# Runbook — running and testing the Shatam Care LMS

Everything below was verified against the running system on 2026-08-08.

---

## 0. Prerequisites (one-time)

- **Docker Desktop**, with access to your Documents folder granted in
  System Settings → Privacy & Security → Files and Folders. Without it the
  bind mount fails with `operation not permitted` (macOS TCC).
- **Node 20+** for the frontend (`node --version`). The *backend's* stricter
  Python 3.14 / Node 24 requirements live inside the container — your machine
  doesn't need them.

You do **not** need MariaDB, Redis, Python 3.14 or bench installed locally.

---

## 1. Start the backend

```bash
cd frappe
docker compose up          # add -d to background it
```

First run takes 10–20+ minutes (downloads the framework, creates the site,
installs all three apps). Subsequent starts take seconds — `init.sh` detects the
existing bench and goes straight to `bench start`.

Wait until it responds:

```bash
curl http://localhost:8000/api/method/ping     # -> {"message":"pong"}
```

> ### Stopping vs. removing the container
> This `docker-compose.yml` is **unmodified from upstream frappe/lms**, and this
> behaviour is inherited from it — not something this project introduced.
>
> It persists only two things: the `mariadb-data` named volume (the database)
> and the `.:/workspace` bind mount (your source). The bench itself lives at
> `/home/frappe/frappe-bench` *inside* the container, i.e. in its writable
> layer.
>
> | Action | Bench survives? |
> |---|---|
> | `docker compose stop` / `start` | ✅ yes |
> | `docker compose restart frappe` | ✅ yes |
> | Docker Desktop "Stop", or quitting Docker Desktop | ✅ yes |
> | `docker compose down` | ❌ no — container removed |
> | Docker Desktop "Delete" (trash icon) | ❌ no |
>
> **Day to day, use `docker compose stop`.** It preserves everything and starts
> again in seconds.
>
> **If the bench does get destroyed, nothing important is lost.** All source
> lives in `~/Documents`, bind-mounted, never inside the container. Only the
> bench install and test data go, and `docker compose up` rebuilds both
> automatically (~15–25 min) — `init.sh` is idempotent and carries every fix.
> The only real cost is the wait.
>
> Removing the container while *keeping* the database volume is the awkward
> in-between state, so if you do tear down, tear down fully:
> `docker compose down -v`.
>
> **Running natively instead removes this concern entirely** — the bench becomes
> an ordinary directory on disk and `bench start` is just a process supervisor,
> so stopping it loses nothing. See SYSTEM_CHANGES.md for why the native route
> was nonetheless set aside here.

## 2. Start the frontend

```bash
cd frappe/shatam-care-web
cp .env.local.example .env.local     # first time only
npm install                          # first time only
npm run dev                          # -> http://localhost:3000
```

`.env.local` must point at the backend:
```
NEXT_PUBLIC_FRAPPE_URL=http://localhost:8000
```

If it lands on a port other than 3000, either free 3000 or add the new origin to
the backend's CORS allowlist (see Troubleshooting) — the browser blocks calls
from an unlisted origin even though curl works fine.

---

## 3. Automated test — run this first

```bash
cd frappe
python3 smoke-test.py http://localhost:8000
```

Walks the whole product over the real HTTP API and should end with
`passed: 33   failed: 0`:

admin creates a course → assigns teacher + evaluator → builds the final
assessment → creates chapter, lesson and an in-video checkpoint → approves and
publishes → registers and enrolls a student → student reads the outline, answers
the checkpoint, completes the lesson, passes the assessment → the auto-gate
flips to *Eligible* → evaluator approves → certificate issues → the public
`/verify` page resolves it.

It creates fresh users and a course on every run (identities are timestamped),
so it's safe to re-run. Data accumulates in the dev site.

**If it fails**, the failing line names the step. Check the backend log:
```bash
docker compose logs --tail 200 frappe
```

---

## 4. Manual walkthrough

Test accounts:

| Role | Login | Password |
|---|---|---|
| Admin | `Administrator` | `admin` |
| Student | `demo.student@example.com` | `Kestrel-Bamboo-42` |

The smoke test also creates per-run teacher/evaluator accounts, but their
passwords are printed only during that run. To get a teacher or evaluator you
can log in as repeatedly, create them from the admin UI (step 4a) — the
temporary password is shown once on screen, so write it down.

Frappe enforces password strength: `demo1234` is rejected, `Kestrel-Bamboo-42`
is accepted.

### 4a. As admin — `http://localhost:3000`

1. Sign in as `Administrator` / `admin`.
2. **Manage Courses** → *+ New course* → give it a title.
3. Open the course:
   - **Teachers** — search a user, add them (also grants the Course Creator role)
   - **Certificate Evaluator** — set one (grants Batch Evaluator, creates the
     Course Evaluator record). Certificates cannot be approved without this.
   - **Final Assessment** — create it, set the pass mark, add questions. Tick the
     checkbox beside each correct option; ticking more than one makes it
     multi-answer. Max 4 options.
   - **Publish** when ready.
4. **Students** → *+ New student* to register a learner and enroll them.
   **Copy the temporary password** — it is shown once.
5. **Groups** → optional region/coordinator tags for reporting.

### 4b. As teacher — `My Lessons`

1. Sign in as the user you added as a teacher.
2. Pick the course → *+ Add lesson* → chapter title, lesson title, YouTube URL
   or bare video ID.
3. Open the lesson:
   - Play the video, then **Pause here & add quiz checkpoint** — it captures the
     current timestamp. Add the question and options, mark the correct one.
   - Checkpoints appear as markers on the bar under the player; click a
     timestamp to jump there. **Edit** to change wording or add a per-language
     translation; **Delete** works until a learner has answered it.
   - **Submit for review** when done.
4. Back as admin: **Review** → Approve.

### 4c. As student — the main flow

1. Sign in as `demo.student@example.com`.
2. **Courses** → open *Student Demo: Bedside Care* (already enrolled, with a
   checkpoint 5 seconds in so the overlay triggers almost immediately).
3. Open **Lesson 1: Safe Lifting** and let the video play:
   - At 5s the video should **pause** and an overlay ask the question.
   - You must answer to resume — a wrong answer is recorded but still lets you
     continue (deliberate: soft checkpoint, see PLAN.md 3.3).
   - Reload and replay: the checkpoint should **not** fire again (first-watch
     enforcement only).
4. Set **Language** on the course page — it changes quiz/certificate language.
   For the *video's* audio track, use YouTube's own gear icon; there's no API to
   set it programmatically.
5. Let the lesson finish so it's marked complete, then **Take assessment**.
6. Pass it → the course page shows *awaiting evaluator approval*.

### 4d. As evaluator, then verify

1. Sign in as the evaluator → **Approvals** → *Approve & issue certificate*.
2. Back as the student → **Certificates** → the certificate appears with its ID.
3. Open the public verification page — no login required:
   `http://localhost:8000/verify?id=SCF-2026-000001` (use the real ID shown).

> **Known-broken:** the *Download PDF* link on the certificates page fails —
> wkhtmltopdf isn't installed in the image. Issuance, ID, QR and the verification
> page all work.

### 4e. Frappe desk (admin backend) — `http://localhost:8000/app`

`Administrator` / `admin`. Useful for inspecting raw records, Print Formats and
Language entries. Note it still shows stock LMS modules we don't use (job board,
badges, programs…) — those removals are documented but not yet applied.

---

## 5. Changing code

**Frontend** — hot reloads; nothing extra.

**Backend** — `bench get-app` made a *clone*, so `apps/shatam_care` inside the
container does **not** see your edits. Push them in:

```bash
cd frappe
./sync-app.sh              # Python changes (reloads in developer mode)
./sync-app.sh --migrate    # doctype JSON / fixture changes — needs a migrate
```

Rule of thumb: touched a `.json` under `doctype/` or anything in `fixtures/`?
Use `--migrate`.

---

## 6. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Browser calls fail but `curl` works | CORS. Add your frontend origin: `docker compose exec frappe bench --site lms.localhost set-config --parse allow_cors '["http://localhost:3000"]'` |
| `operation not permitted` on `docker compose up` | Docker lacks Documents access — grant it in System Settings → Privacy & Security → Files and Folders |
| Connection reset on :8000, but the app answers inside the container | `bench serve` bound to 127.0.0.1. `init.sh` patches the Procfile to `--host 0.0.0.0`; if editing by hand, restart with `docker compose restart frappe` |
| Backend code change has no effect | You edited the source, not the container's clone — run `./sync-app.sh` |
| New field/doctype missing | `./sync-app.sh --migrate` |
| "Password requirements not met" | Frappe's strength check — use something like `Kestrel-Bamboo-42` |
| Login works but you're signed out elsewhere | Fixed — tokens are now reused rather than rotated per login |
| Student sees 403 / "could not load" | Students have no direct read on `Course Lesson`; content must go through `shatam_care.shatam_care.content.*`. Check the frontend isn't calling `/api/resource/Course Lesson` |
| Course outline empty in stock lms | Missing `Chapter Reference` / `Lesson Reference` rows. Create content via the `content.py` helpers, not raw resource POSTs |

Backend logs: `docker compose logs --tail 200 frappe`

---

## 7. What you won't be able to test

These are genuinely not built yet — see STATUS.md:

- **Self-service signup.** `/login` is the only public page; learners must be
  registered by an admin.
- **Certificate PDF download** (wkhtmltopdf missing).
- **Real branding** — placeholder green, no logo, stock certificate template.
- **Assessment-question translations** — backend applies them, but there's no
  authoring UI (checkpoint translations do have one).
- Renaming a course after creation, reordering/deleting lessons, moving a
  student between groups.
