# Manual UI test script

A click-through of the whole product. ~20 minutes. Each step says what to do and
**what you should see** — if reality differs, that's a bug worth reporting.

> **Why this matters:** the backend is covered by `smoke-test.py` (33 automated
> checks). What is *not* covered is the UI. Several bugs so far had perfectly
> working APIs and a broken screen, so these are the steps that find real
> problems. Steps marked 🔴 have **never been verified in a browser** — pay the
> most attention there.

## Setup

```bash
cd frappe
docker compose up -d                                  # if not already running
curl http://localhost:8000/api/method/ping            # expect {"message":"pong"}

cd shatam-care-web && npm run dev                     # http://localhost:3000

cd .. && python3 seed-demo.py                         # fresh demo course + logins
```

`seed-demo.py` is re-runnable. Each run creates a **new** course so the student
starts clean, and resets the demo passwords so the ones below always work.

| Role | Login | Password |
|---|---|---|
| Admin | `Administrator` | `admin` |
| Teacher | `demo.teacher@example.com` | `Teacher-Bamboo-42` |
| Evaluator | `demo.evaluator@example.com` | `Evaluator-Bamboo-42` |
| Student | `demo.student@example.com` | `Kestrel-Bamboo-42` |

Everything is at **http://localhost:3000**. Use a private window (or sign out)
when switching roles.

---

## Part A — Student (start here; the content already exists)

The most valuable part of this script. Course: **Demo: Safe Patient Handling**.

- [ ] **A1.** Sign in as the **student**.
      → Dashboard shows *My Courses* and *My Certificates* only. **No** admin,
      teacher or evaluator links — that's role-gating working.

- [ ] **A2.** **Courses** → the course list loads with real courses.

- [ ] **A3.** Open *Demo: Safe Patient Handling*.
      → Real course **title** as the heading (not the word "Course"), the chapter
      *Module 1 — Foundations* with its lesson, a **Language** selector, and a
      **Final Assessment** card reading *pass mark 50%*.
      ⚠️ If it says 100%, that's a regression — the admin's pass mark is being
      overwritten.

- [ ] **A4.** 🔴 Open the lesson **Lifting a patient safely**.
      → The YouTube player loads and starts.

- [ ] **A5.** 🔴 **Let it play to 0:05.** *This is the single most important step.*
      → Video **pauses**, an overlay appears asking *"When lifting a patient,
      what should you bend?"*
      → Pick **Your knees** → **Submit answer** → says *Correct!*
      → **Continue watching** → the overlay closes and **the video resumes**.

- [ ] **A6.** 🔴 Try a **wrong** answer flow later if you like: a wrong answer is
      recorded but must still let you continue. It should never trap you.

- [ ] **A7.** 🔴 **Reload the lesson page and replay from the start.**
      → The checkpoint should **NOT** fire again. Enforcement is first-watch
      only, so revisiting a lesson isn't punished. A repeat prompt is a bug.

- [ ] **A8.** 🔴 Let the video **finish**.
      → *"Lesson marked complete"* appears.

- [ ] **A9.** Back on the course page, click **Take assessment**.
      🔴 → One question with two options, header showing *pass mark 50%*.

- [ ] **A10.** 🔴 Answer **Your back** → **Submit assessment**.
      → *You passed!* with your score, and a note that the certificate is
      awaiting evaluator approval.

- [ ] **A11.** Return to the course page.
      → The **Certificate** section reads *awaiting evaluator approval*.

- [ ] **A12.** Set **Language** to something other than default.
      → Shows *Saved*. (It changes quiz/certificate text language. The video's
      audio track is switched from YouTube's own gear icon — there's no API to
      do it for you.)

---

## Part B — Evaluator

- [ ] **B1.** Sign out, sign in as the **evaluator**.
      → Nav shows **Approvals** only.

- [ ] **B2.** 🔴 **Approvals** → the student appears, pending.

- [ ] **B3.** 🔴 **Approve & issue certificate** → the row disappears.

---

## Part C — Student collects the certificate

- [ ] **C1.** Sign back in as the **student** → **Certificates**.
      🔴 → The certificate is listed with an ID like `SCF-2026-000006`.

- [ ] **C2.** Click **Verification page** (opens the backend).
      → *Valid Certificate*, with name, course and issue date.

- [ ] **C3.** Copy that URL into a **private window** (logged out).
      → Still shows *Valid Certificate*. Public verification needs no account.

- [ ] **C4.** ❌ **Download PDF is known-broken** — wkhtmltopdf isn't installed.
      Expected to fail; not a new bug.

---

## Part D — Teacher (authoring)

- [ ] **D1.** Sign in as the **teacher** → **My Lessons**.
      → *Demo: Safe Patient Handling* is listed with its lesson and an
      **Approved** badge.

- [ ] **D2.** **+ Add lesson** → chapter *Module 1 — Foundations* (it should
      autocomplete), any title, and a YouTube URL or bare ID.
      → The lesson appears with a **Draft** badge.

- [ ] **D3.** 🔴 Open your new lesson. The player loads.
      Let it play a few seconds → **Pause here & add quiz checkpoint**.
      → The video pauses and a form appears prefilled with that timestamp.

- [ ] **D4.** 🔴 Add a question and two options, tick the correct one, **Save**.
      → A marker appears on the bar under the player. Clicking the timestamp
      jumps the video there.

- [ ] **D5.** 🔴 **Edit** the checkpoint → change the wording → **Save changes**.
      Then try **Delete** on it → should succeed (nobody has answered it yet).

- [ ] **D6.** 🔴 **Submit for review** → status becomes *Submitted for Review*.

---

## Part E — Admin

- [ ] **E1.** Sign in as `Administrator` → dashboard shows **all** capability
      cards.

- [ ] **E2.** **Review** → the teacher's lesson from D6 is pending → **Approve**.
      → It disappears from the queue.

- [ ] **E3.** **Manage Courses** → list shows lesson/enrollment counts and
      Published/Draft badges. Courses missing an evaluator or assessment are
      flagged in amber.

- [ ] **E4.** 🔴 **+ New course** → create one → open it.
      Add a **Teacher** (search `demo.teacher`), set an **Evaluator**
      (search `demo.evaluator`), then **Create** the final assessment and add a
      question — tick the correct option.
      → Everything saves and is reflected on the page.

- [ ] **E5.** 🔴 **Publish** the course → badge flips to Published.

- [ ] **E6.** 🔴 **Students** → *+ New student* → register someone and enroll
      them in your new course.
      → A **temporary password is shown once** — note it.
      (Try a weak password like `demo1234` first: it should be rejected with a
      strength message. That's Frappe, working as intended.)

- [ ] **E7.** **Groups** → create a student group (e.g. *Nashik — Coordinator
      Priya*). Admin-only reporting tag; students never see it.

- [ ] **E8.** Optional: sign in as the student you just created and confirm they
      can see and enroll themselves in the new course.

---

## If something fails

Tell me:
1. **Which step** (e.g. A5)
2. **What you saw** instead of the expected result
3. **Browser console errors** — F12 → Console
4. **Failed network calls** — F12 → Network, look for red / 4xx / 5xx

Backend logs: `docker compose logs --tail 100 frappe`

## Known gaps — not bugs

- **No signup page.** Students must be registered by an admin (E6). Deliberate
  gap, still to build.
- **Download PDF fails** (C4).
- **Branding is placeholder** — green palette, no logo, stock certificate design.
- **Assessment-question translations** have no authoring UI; checkpoint
  translations do (D5).

## When you're done

`docker compose stop` — preserves everything and restarts in seconds. Avoid
`docker compose down`, which removes the container and the bench with it.
