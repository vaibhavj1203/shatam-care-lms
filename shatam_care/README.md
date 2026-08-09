# Shatam Care

Frappe app holding all Shatam Care Foundation customizations on top of the
`lms` app (Frappe Learning). Kept as a separate app so the upstream `lms`
fork stays cleanly pullable — see `../PLAN.md` and `../SCHEMA.md` for the
full design this implements.

## Install

```
bench get-app shatam_care /workspace/shatam_care
bench --site lms.localhost install-app shatam_care
bench --site lms.localhost migrate
```
