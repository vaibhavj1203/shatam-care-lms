"""Point every issued certificate at the "Shatam Certificate" Print Format.

Certificates issued before the admin-managed template existed carry the stock
"Certificate" format in their `template` field. Downloads now always render
with the Shatam format, but keeping the stored value accurate means anything
that reads it (the desk, reports, a future export) tells the truth.

Idempotent: only touches rows that differ.
"""

import frappe

from shatam_care.shatam_care.certificate_template import PRINT_FORMAT


def execute():
	if not frappe.db.exists("Print Format", PRINT_FORMAT):
		return
	frappe.db.sql(
		"update `tabLMS Certificate` set template = %s where ifnull(template, '') != %s",
		(PRINT_FORMAT, PRINT_FORMAT),
	)
