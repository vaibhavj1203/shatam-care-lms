#!bin/bash

if [ -d "/home/frappe/frappe-bench/apps/frappe" ]; then
    echo "Bench already exists, skipping init"
    cd frappe-bench
    bench start
else
    echo "Creating new bench..."
fi

export PATH="${NVM_DIR}/versions/node/v${NODE_VERSION_DEVELOP}/bin/:${PATH}"

# Toolchain note (learned from an aborted native install, see SYSTEM_CHANGES.md):
# frappe's develop branch requires Python >=3.14,<3.15 and Node >=24. If this
# init fails inside the container with either
#   "SyntaxError: invalid syntax"           (on `type X = ...` — Python too old)
#   'engine "node" is incompatible ... >=24' (Node too old)
# then frappe/bench:latest is shipping an older toolchain than develop needs.
# Fix by pinning a matching frappe branch instead, e.g.:
#   bench init --skip-redis-config-generation --frappe-branch version-15 frappe-bench
bench init --skip-redis-config-generation frappe-bench

cd frappe-bench

# Use containers instead of localhost
bench set-mariadb-host mariadb
bench set-redis-cache-host redis://redis:6379
bench set-redis-queue-host redis://redis:6379
bench set-redis-socketio-host redis://redis:6379

# Remove redis, watch from Procfile
sed -i '/redis/d' ./Procfile
sed -i '/watch/d' ./Procfile

# `bench serve` binds 127.0.0.1 by default, which is unreachable through the
# container's published port — the app answers fine inside the container while
# the host gets a connection reset. Bind all interfaces instead.
sed -i 's|^web: bench serve  *--port 8000|web: bench serve --host 0.0.0.0 --port 8000|' ./Procfile

# payments is a hard dependency declared in lms/hooks.py's required_apps —
# kept installed, but all payment-related fields/flows are hidden via
# Property Setters shipped in the shatam_care app (see REMOVAL_CANDIDATES.md).
bench get-app payments

# The lms fork is NOT vendored in this repo — it's an unmodified copy of
# upstream frappe/lms (~330MB), so shipping it would bloat the clone for no
# benefit. Override LMS_REPO to point at a local checkout for faster rebuilds:
#   LMS_REPO=/workspace/shatam-care-lms docker compose up
bench get-app lms "${LMS_REPO:-https://github.com/vaibhavj1203/shatam-care-lms}"

# --skip-assets: shatam_care ships no frontend assets (no package.json, no
# public/), so `bench build` for it is a no-op that still spawns esbuild. On the
# first run that build was killed (SIGTERM/exit 143, likely memory pressure),
# which aborted get-app *before* it registered the app in sites/apps.txt — and
# `install-app shatam_care` then failed with "App shatam_care not in apps.txt".
# Skipping the pointless build removes the failure mode entirely.
bench get-app --skip-assets shatam_care /workspace/shatam_care

# Belt and braces: if get-app ever fails to register an app, install-app dies
# with a confusing "App <name> not in apps.txt". Make sure it's listed.
for app in payments lms shatam_care; do
    grep -qx "$app" sites/apps.txt 2>/dev/null || printf '\n%s\n' "$app" >> sites/apps.txt
done
# Collapse any blank lines the append may have introduced.
sed -i '/^$/d' sites/apps.txt

bench new-site lms.localhost \
--force \
--mariadb-root-password 123 \
--admin-password admin \
--no-mariadb-socket

bench --site lms.localhost install-app payments
bench --site lms.localhost install-app lms
bench --site lms.localhost install-app shatam_care
bench --site lms.localhost set-config developer_mode 1

# The Next.js frontend runs on a different origin (localhost:3000) and uses
# token auth rather than same-origin session cookies, so CORS must be allowed
# or every API call from it fails — the browser blocks it while identical
# requests from curl/python succeed, which makes it look like an auth bug.
# 3900 is the Claude preview proxy; harmless to allow in a dev compose file.
bench --site lms.localhost set-config --parse allow_cors '["http://localhost:3000", "http://localhost:3900"]'

bench --site lms.localhost clear-cache
bench use lms.localhost

bench start
