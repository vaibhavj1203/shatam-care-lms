#!/bin/bash
# Provision and start the Frappe backend. Safe to run repeatedly: every step
# below is guarded, so `docker compose up` works identically on a first run and
# on the hundredth.
set -euo pipefail

BENCH=/home/frappe/frappe-bench
SITE=lms.localhost
LMS_REPO="${LMS_REPO:-https://github.com/vaibhavj1203/shatam-care-lms}"
# The fork's default branch holds only a README; the actual frappe/lms code
# lives on develop. Cloning the default branch yields a directory that is not a
# Frappe app at all, and bench fails with a confusing error late in the run.
LMS_BRANCH="${LMS_BRANCH:-develop}"

# frappe/bench:latest already puts a suitable node (v24) on PATH, and it does
# NOT define NODE_VERSION_DEVELOP — the line that used to live here expanded to
# a bogus ".../versions/node/v/bin" and worked purely by accident. Only prepend
# an nvm path when a version is actually pinned.
if [ -n "${NODE_VERSION_DEVELOP:-}" ]; then
    export PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/v${NODE_VERSION_DEVELOP}/bin:${PATH}"
fi
echo "==> node $(node -v 2>/dev/null || echo 'NOT FOUND')"

# Toolchain note (learned from an aborted native install, see SYSTEM_CHANGES.md):
# frappe's develop branch requires Python >=3.14,<3.15 and Node >=24. If this
# init fails with either
#   "SyntaxError: invalid syntax"           (on `type X = ...` — Python too old)
#   'engine "node" is incompatible ... >=24' (Node too old)
# then frappe/bench:latest ships an older toolchain than develop needs. Fix by
# pinning a matching frappe branch on the bench init line below, e.g.
# --frappe-branch version-15.

if [ ! -d "$BENCH/apps/frappe" ]; then
    echo "==> Creating bench"
    # --ignore-exist is essential, not cosmetic: frappe-bench is a mounted
    # volume, so the directory always exists by the time this runs. Without the
    # flag `bench init` logs "Bench instance already exists" and returns exit 0
    # without doing anything, and every later command fails against an empty
    # bench for reasons that look unrelated.
    bench init --skip-redis-config-generation --ignore-exist "$BENCH"
else
    echo "==> Bench already provisioned, skipping init"
fi

cd "$BENCH"

# Point at the compose services rather than localhost.
bench set-mariadb-host mariadb
bench set-redis-cache-host redis://redis:6379
bench set-redis-queue-host redis://redis:6379
bench set-redis-socketio-host redis://redis:6379

# Redis and the asset watcher are handled outside the Procfile here.
sed -i '/redis/d' ./Procfile
sed -i '/watch/d' ./Procfile
# `bench serve` binds 127.0.0.1 by default, which is unreachable through the
# container's published port — the app answers fine inside the container while
# the host gets a connection reset. Bind all interfaces instead.
sed -i 's|^web: bench serve  *--port 8000|web: bench serve --host 0.0.0.0 --port 8000|' ./Procfile

# payments is a hard dependency declared in lms/hooks.py's required_apps —
# kept installed, but all payment-related fields/flows are hidden via Property
# Setters shipped in the shatam_care app (see REMOVAL_CANDIDATES.md).
[ -d apps/payments ] || bench get-app payments

# The lms fork is NOT vendored in this repo — it's an unmodified copy of
# upstream frappe/lms (~330MB), so shipping it would bloat the clone for no
# benefit. Point LMS_REPO at a local checkout for much faster rebuilds:
#   LMS_REPO=/workspace/shatam-care-lms docker compose up
[ -d apps/lms ] || bench get-app --branch "$LMS_BRANCH" lms "$LMS_REPO"

# --- our app ------------------------------------------------------------------
# `bench get-app <path>` performs a git *clone*, and /workspace/shatam_care is a
# subdirectory of the project repo rather than a repository in its own right, so
# cloning it fails with "repository '/workspace/shatam_care' does not exist".
# Stage a snapshot that has its own history instead. This keeps provisioning
# working from a plain checkout, with no assumptions about how the source tree
# happens to be versioned.
if [ ! -d apps/shatam_care ]; then
    echo "==> Staging shatam_care source"
    rm -rf /tmp/shatam_care_src
    cp -R /workspace/shatam_care /tmp/shatam_care_src
    rm -rf /tmp/shatam_care_src/.git
    git -C /tmp/shatam_care_src init -q
    git -C /tmp/shatam_care_src add -A
    git -C /tmp/shatam_care_src \
        -c user.email=dev@shatamcare.local -c user.name=dev \
        commit -qm "shatam_care snapshot"
    # --skip-assets: shatam_care ships no frontend assets (no package.json, no
    # public/), so `bench build` for it is a no-op that still spawns esbuild. On
    # the first run that build was killed (SIGTERM/exit 143, likely memory
    # pressure), which aborted get-app *before* it registered the app in
    # sites/apps.txt — and install-app then failed with "not in apps.txt".
    bench get-app --skip-assets shatam_care /tmp/shatam_care_src
fi

# Refresh the app source on every start so a restart picks up local edits
# without needing ./sync-app.sh. The clone above is only ever a starting point.
# Plain cp, not rsync — frappe/bench:latest does not ship rsync, and adding
# packages at start time would need root plus a network round-trip.
SRC=/workspace/shatam_care/shatam_care
DST="$BENCH/apps/shatam_care/shatam_care"
if [ -d "$SRC" ] && [ -d "$DST" ]; then
    find "$DST" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
    cp -R "$SRC/." "$DST/"
    find "$DST" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
fi

# Belt and braces: if get-app ever fails to register an app, install-app dies
# with a confusing "App <name> not in apps.txt".
for app in payments lms shatam_care; do
    grep -qx "$app" sites/apps.txt 2>/dev/null || printf '\n%s\n' "$app" >> sites/apps.txt
done
sed -i '/^$/d' sites/apps.txt

# --- site ---------------------------------------------------------------------
# Deliberately NOT `--force`. Because the bench used to live in the container's
# writable layer while MariaDB had a volume, recreating the container re-ran this
# script and --force silently dropped and recreated the site database, destroying
# every course, learner and certificate while the DB volume survived around it.
# Creating the site only when it is genuinely absent removes that failure mode.
if [ ! -d "sites/$SITE" ]; then
    echo "==> Creating site $SITE"
    bench new-site "$SITE" \
        --mariadb-root-password 123 \
        --admin-password admin \
        --no-mariadb-socket
else
    echo "==> Site $SITE already exists, preserving it"
fi

installed="$(bench --site "$SITE" list-apps 2>/dev/null || true)"
for app in payments lms shatam_care; do
    if echo "$installed" | grep -qw "$app"; then
        echo "==> $app already installed"
    else
        bench --site "$SITE" install-app "$app"
    fi
done

bench --site "$SITE" set-config developer_mode 1

# The Next.js frontend runs on a different origin and uses token auth rather
# than same-origin session cookies, so CORS must be allowed or every API call
# from it fails — the browser blocks it while identical requests from curl or
# python succeed, which makes it look like an auth bug. 3900 is the Claude
# preview proxy; harmless to allow in a dev compose file.
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-http://localhost:3000}"
bench --site "$SITE" set-config --parse allow_cors \
    "[\"$FRONTEND_ORIGIN\", \"http://localhost:3000\", \"http://localhost:3900\"]"

# Applies doctype, custom field and property setter changes from the source
# refreshed above, so a restart is all that's needed after editing the app.
echo "==> Running migrations"
bench --site "$SITE" migrate

bench --site "$SITE" clear-cache
bench use "$SITE"

bench start
