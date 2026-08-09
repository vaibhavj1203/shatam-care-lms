# Shatam Care LMS

A learning management system for **Shatam Care Foundation**, an NGO that trains
geriatric caregivers in tier-3 cities and villages across India. Learners study
from pre-recorded video lessons, are tested along the way, and receive a
certificate on completion.

Built on [Frappe Learning](https://github.com/frappe/lms) with a custom
Next.js frontend.

> **Status: working, but not production-ready.** The whole flow runs end to end
> and is covered by an automated test, but several things are deliberately
> unfinished — most notably there is no self-service signup, and the branding
> and certificate template are placeholders. See [STATUS.md](STATUS.md) for the
> honest list before you rely on any of this.

## What makes it different from stock Frappe Learning

| | |
|---|---|
| **In-video quiz checkpoints** | Playback pauses at teacher-defined timestamps and asks a question. Answering resumes the video. Enforced on the first watch only, so revisiting a lesson isn't punished. This is the mechanism that evidences engagement in place of classroom attendance. |
| **Auto-gated certification** | A learner becomes eligible only after completing every lesson, answering every checkpoint, and passing the final assessment. Eligibility is then reviewed by a per-course human evaluator — deliberately not fully automatic, since the certificate attests to caregiving competence. |
| **Verifiable certificates** | Each carries a unique ID and QR code resolving to a public `/verify` page, so an employer can check it without an account. |
| **Multi-language by dubbing** | One video per lesson with YouTube's multi-audio tracks, rather than duplicate courses per language. Only quiz and certificate *text* is translated. |
| **Purpose-built frontend** | A Next.js app aimed at low-digital-literacy learners, replacing the stock Vue UI. Frappe is used purely as an API. |

## Architecture

```
shatam_care/       Custom Frappe app — all backend logic (new doctypes, APIs, hooks)
shatam-care-web/   Next.js 16 frontend (token auth against the Frappe REST API)
docker-compose.yml + init.sh   Local dev stack: Frappe + MariaDB + Redis
```

The upstream `lms` app is **not** vendored here — `init.sh` clones it. Custom
work lives entirely in `shatam_care/` so the upstream fork stays cleanly
pullable.

## Quick start

Requires Docker (with access to the folder you clone into) and Node 20+.

```bash
git clone <this-repo> && cd <this-repo>

docker compose up -d                      # first run: 15-25 min
# wait for: curl http://localhost:8000/api/method/ping  -> {"message":"pong"}

cd shatam-care-web
cp .env.local.example .env.local
npm install && npm run dev                # http://localhost:3000
```

Verify the whole product works:

```bash
python3 smoke-test.py http://localhost:8000     # expect 33/33
```

Default credentials are `Administrator` / `admin`. **These are development
defaults set in `init.sh`, along with a weak database password — change both
before exposing this anywhere.**

Full instructions, a manual test walkthrough for all four personas, and a
troubleshooting table: **[RUNBOOK.md](RUNBOOK.md)**.

## Documentation

| File | What's in it |
|---|---|
| [RUNBOOK.md](RUNBOOK.md) | How to run and test it, plus troubleshooting |
| [STATUS.md](STATUS.md) | What works, what doesn't, and every defect found so far |
| [PLAN.md](PLAN.md) | The product decisions and *why* — read before changing behaviour |
| [SCHEMA.md](SCHEMA.md) | Data model, and where it diverged from the plan |
| [CLAUDE.md](CLAUDE.md) | Architecture notes and non-obvious constraints for contributors |
| [REMOVAL_CANDIDATES.md](REMOVAL_CANDIDATES.md) | Stock LMS features deliberately out of scope |
| [BRANDING.md](BRANDING.md) | Where to drop in real logo, colours and certificate design |

`PLAN.md` is worth reading before changing anything — it records roughly twenty
decisions (why certificates need human approval, why checkpoints only enforce on
first watch, why there are no cohorts) that aren't obvious from the code.

## Contributing

Two constraints that will save you time:

1. **Never edit the `lms` app.** It's upstream, kept clean so it can be pulled.
   All customisation goes in `shatam_care/` — new doctypes, Custom Fields for
   new fields on stock doctypes, Property Setters to hide stock ones.
2. **Reuse stock LMS logic** rather than reimplementing it. Quiz scoring, for
   example, already exists upstream; `assessment.py` is a thin wrapper
   specifically so there aren't two scoring paths that can drift.

After changing backend code, push it into the running container with
`./sync-app.sh` (add `--migrate` for doctype or fixture changes) — `bench
get-app` made a *clone*, so the container doesn't see your edits otherwise.

## Licence

[AGPL-3.0-or-later](LICENSE), matching upstream Frappe Learning.

In short: you may use, modify and run this freely, including commercially. If
you distribute a modified version — **or host one as a network service** — you
must make your source available under the same licence. That network clause is
what distinguishes AGPL from ordinary GPL, and it applies to anyone hosting this
for learners.
