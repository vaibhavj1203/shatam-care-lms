# System Changes — FULLY REVERTED

**Status: all system-level changes from the native-bench attempt were reverted
on 2026-08-06 and verified clean.** This file is kept as a record of what was
done and undone, and as a checklist if a native setup is ever attempted again.

The project has moved to the **Docker** path (`docker compose up`), which keeps
MariaDB, Redis, Python and Node inside containers and touches no system
defaults.

---

## Verified post-revert state

| Check | Result |
|---|---|
| `python3` | 3.9.6 (`/usr/bin/python3`) — original ✓ |
| `node` | v20.12.1 (`/usr/local/bin/node`) — original ✓ |
| brew: mariadb, redis, python@3.14, node@24, node@22 | all uninstalled ✓ |
| Background services | none running or autostarting ✓ |
| Ports 3306 / 6379 | nothing listening ✓ |
| `/opt/homebrew/etc/my.cnf` | removed ✓ |
| `/opt/homebrew/var/mysql` (143 MB) | removed ✓ |
| `~/Library/LaunchAgents/homebrew.mxcl.mariadb.plist` | removed ✓ |
| `bench` CLI (pip `frappe-bench`) | uninstalled ✓ |
| `frappe/frappe-bench/` (1.0 GB) | deleted ✓ |
| Dangling global `yarn` symlink | removed ✓ |

**Never touched at any point:** `sudo` (never used), `/etc/hosts`,
`/usr/bin/python3`, any system directory. Nothing was deleted outside the
Homebrew prefix and this project folder.

---

## What had been changed, and why it was reverted

### Packages installed (then removed)
`mariadb` 12.3.2, `redis` 8.10.0, `python@3.14` 3.14.6, `node@24` 24.19.0,
`node@22` 22.23.2 (this last one installed **in error** — I read the required
Node version off `lms/package.json` (`>=22`) before finding that
`apps/frappe/package.json` requires `>=24`).

### The changes that actually mattered
Two Homebrew formulae were **linked**, silently changing shell defaults and
therefore affecting unrelated projects on this machine:

| Command | Before | During | Restored |
|---|---|---|---|
| `python3` | 3.9.6 | 3.14.6 | 3.9.6 ✓ |
| `node` | v20.12.1 | v22.23.2 | v20.12.1 ✓ |

This is the main lesson: `brew install python@3.14` is not self-contained —
it symlinks `python3` into `/opt/homebrew/bin`, which precedes `/usr/bin` in
PATH. Anything on the machine calling `python3` silently switched interpreter
and lost visibility of packages installed under the old one.

### Security issue that was introduced (and is now gone)
MariaDB was left listening on `*:3306` (all interfaces, not loopback) with root
password `root`, while the macOS application firewall is disabled. This was
open for the duration of the setup attempt. It is closed now — MariaDB is
uninstalled and nothing listens on 3306.

If a database is ever run natively on this machine again, add
`bind-address = 127.0.0.1` under `[mysqld]` before starting it.

---

## If a native setup is ever attempted again

The toolchain requirements that made it painful (all discovered the hard way):

- **Python `>=3.14,<3.15`** — frappe `develop` uses PEP 695 `type X = ...`
  syntax; anything below 3.12 fails with a bare `SyntaxError: invalid syntax`
  that never mentions Python versions.
- **Node `>=24`** — from `apps/frappe/package.json`, *not* lms's `>=22`.
  `bench init` runs `yarn install` for frappe itself, so Node 22 fails the
  whole init.
- Both of these match what `lms/.github/workflows/ci.yml` pins
  (`python-version: 3.14`, `node-version: 24`) — reading that file first is the
  fastest way to get the versions right.
- MariaDB needs utf8mb4 settings in `my.cnf` or `bench new-site` fails.
- Use `brew unlink python@3.14 node@24` after installing, and point bench at
  absolute interpreter paths, to avoid changing system defaults.
