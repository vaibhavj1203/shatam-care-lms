"""Certificate creation: unique ID + QR verification, per-language template.

See ../../PLAN.md section 3.5 (steps 3-4) and ../../SCHEMA.md
("LMS Certificate" custom fields, "Public verification page").
"""

import io

import frappe
from frappe.utils import now_datetime
from frappe.utils.file_manager import save_file

from shatam_care.shatam_care.certificate_template import PRINT_FORMAT


def issue_certificate(member, course, evaluator):
	enrollment = frappe.db.get_value(
		"LMS Enrollment", {"member": member, "course": course}, ["name", "preferred_language"], as_dict=True
	)
	template = get_certificate_template(course, enrollment.preferred_language if enrollment else None)

	certificate = frappe.new_doc("LMS Certificate")
	certificate.member = member
	certificate.course = course
	certificate.evaluator = evaluator
	certificate.issue_date = now_datetime().date()
	certificate.template = template
	certificate.published = 1
	certificate.certificate_uid = generate_certificate_uid()
	certificate.verification_url = build_verification_url(certificate.certificate_uid)
	certificate.insert(ignore_permissions=True)

	attach_qr_code(certificate)
	return certificate


def get_certificate_template(course=None, language=None):
	"""Every certificate uses the one "Shatam Certificate" Print Format.

	What an admin customises is not the Print Format but the background image
	and signatory text it reads at render time (Shatam Certificate Settings, see
	certificate_template.py). So a new upload applies to all certificates, old
	and new, and there is no per-course or per-language choice to make here.
	`course` and `language` are kept so callers need not change.

	Falls back to stock lms's "Certificate" only if the Shatam format is missing
	(e.g. before the first migrate). Never "Standard": that's Frappe's generic
	list-of-fields dump, not a certificate layout at all."""
	if frappe.db.exists("Print Format", PRINT_FORMAT):
		return PRINT_FORMAT
	return "Certificate"


def generate_certificate_uid():
	year = now_datetime().year
	prefix = f"SCF-{year}-"
	last = frappe.db.sql(
		"""select certificate_uid from `tabLMS Certificate`
		where certificate_uid like %s order by creation desc limit 1""",
		(f"{prefix}%",),
	)
	next_seq = int(last[0][0].split("-")[-1]) + 1 if last else 1
	return f"{prefix}{next_seq:06d}"


def build_verification_url(certificate_uid):
	return f"{frappe.utils.get_url()}/verify?id={certificate_uid}"


def attach_qr_code(certificate):
	try:
		import qrcode
	except ImportError:
		frappe.log_error("qrcode package not installed; skipping QR generation", "Shatam Care")
		return

	img = qrcode.make(certificate.verification_url)
	buffer = io.BytesIO()
	img.save(buffer, format="PNG")

	file_doc = save_file(
		fname=f"{certificate.certificate_uid}-qr.png",
		content=buffer.getvalue(),
		dt="LMS Certificate",
		dn=certificate.name,
		is_private=0,
	)
	certificate.db_set("qr_code", file_doc.file_url)
