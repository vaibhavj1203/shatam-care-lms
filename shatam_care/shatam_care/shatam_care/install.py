"""Placeholder Shatam Care branding, applied on install — see ../../PLAN.md
section 5 / task "Apply Shatam Care branding". The stock lms "Certificate"
print format (lms/lms/print_format/certificate) already reads `app_name`
and `banner_image` off Website Settings, so setting these here is enough to
brand certificates without a custom print format. Swap `app_name` and
upload a real `banner_image` once Shatam provides logo/color assets —
no code change needed for that, just updating Website Settings in the desk.
"""

import frappe


def after_install():
	settings = frappe.get_single("Website Settings")
	if not settings.app_name or settings.app_name == "Frappe":
		settings.app_name = "Shatam Care Foundation"
		settings.save(ignore_permissions=True)
