# shatam-care-web

The Next.js frontend for the Shatam Care LMS. It talks to the Frappe backend
over token auth and replaces the stock Frappe Learning Vue UI entirely.

This app is not meant to be run on its own — it needs the backend. See the
[project README](../README.md) for how to bring up the whole stack, and
[`AGENTS.md`](AGENTS.md) for the one thing that will bite you (this is Next.js 16,
which differs from older versions in ways your instincts won't expect).

```bash
# with the backend already running (see ../README.md):
cp .env.local.example .env.local        # point at the backend URL
npm install && npm run dev              # http://localhost:3000
```
