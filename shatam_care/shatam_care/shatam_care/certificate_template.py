"""Render-time data and upload validation for the "Shatam Certificate" Print Format.

An admin changes how certificates look by uploading a background image (Admin
-> Certificates in the web app). The layout itself is fixed in the Print
Format; the learner's name, course, date and QR code are drawn over the image
each time a certificate is rendered. Because the image is read at render time
rather than copied onto each certificate, a new upload applies to every
certificate, including ones issued earlier.

The Print Format reaches this module through the `jinja` hook in hooks.py.
"""

import base64
import functools
import io
import mimetypes
import os

import frappe
from frappe import _
from frappe.utils import get_url, getdate

SETTINGS_DOCTYPE = "Shatam Certificate Settings"
PRINT_FORMAT = "Shatam Certificate"

DEFAULT_TITLE = "Certificate of Completion"
DEFAULT_BACKGROUND = ("public", "images", "certificate-background-default.png")

# A4 landscape. The Print Format positions text in millimetres, so any image
# with this shape lines up with it; the pixel size only matters for sharpness.
TARGET_WIDTH_PX = 3508
TARGET_HEIGHT_PX = 2480
MIN_WIDTH_PX = 1754  # 150 dpi: below this, print output looks soft
RATIO_TOLERANCE = 0.02
MAX_BYTES = 5 * 1024 * 1024
ALLOWED_FORMATS = ("PNG", "JPEG")


# --- Reading ------------------------------------------------------------------


def file_data_uri(file_url):
	"""Inline a stored File as a data: URI, or "" if it can't be read.

	The PDF engine renders the HTML on its own, without the learner's session,
	so a private or relative URL would not load. Embedding avoids that.
	"""
	if not file_url:
		return ""
	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not name:
		return ""
	try:
		file_doc = frappe.get_doc("File", name)
		content = file_doc.get_content()
	except Exception:
		frappe.log_error(f"Could not read certificate image {file_url}", "Shatam Care")
		return ""
	if isinstance(content, str):
		content = content.encode()
	mime = mimetypes.guess_type(file_doc.file_name or "")[0] or "image/png"
	return _to_data_uri(content, mime)


@functools.lru_cache(maxsize=1)
def _default_background_uri():
	path = frappe.get_app_path("shatam_care", *DEFAULT_BACKGROUND)
	if not os.path.exists(path):
		return ""
	with open(path, "rb") as f:
		return _to_data_uri(f.read(), "image/png")


def _to_data_uri(content, mime):
	return f"data:{mime};base64,{base64.b64encode(content).decode()}"


def qr_data_uri(url):
	try:
		import qrcode
	except ImportError:
		return ""
	buffer = io.BytesIO()
	qrcode.make(url).save(buffer, format="PNG")
	return _to_data_uri(buffer.getvalue(), "image/png")


def get_settings():
	"""The settings record with defaults filled in. Singles only store values
	that were saved, so an admin who never opened the page still gets a
	working certificate."""
	values = frappe.db.get_singles_dict(SETTINGS_DOCTYPE) or {}
	return {
		"background": values.get("background") or "",
		"certificate_title": values.get("certificate_title") or DEFAULT_TITLE,
		"signatory_name": values.get("signatory_name") or "",
		"signatory_title": values.get("signatory_title") or "",
	}


def shatam_certificate_context(doc):
	"""Everything the Print Format needs, in one call (exposed to Jinja).

	Frappe registers a `jinja` hook function under its own `__name__` (not under
	an alias, and not the last part of the path), so this name is the one the
	Print Format calls. Keep the two in step.

	Keeps the template to layout only, and keeps fallbacks (default
	background, evaluator as signatory) in testable Python.
	"""
	settings = get_settings()

	background = file_data_uri(settings["background"]) or _default_background_uri()

	member_name = doc.get("member_name") or (
		frappe.db.get_value("User", doc.get("member"), "full_name") if doc.get("member") else ""
	)
	course_title = doc.get("course_title") or ""

	issue_date = ""
	if doc.get("issue_date"):
		issue_date = getdate(doc.get("issue_date")).strftime("%d %B %Y")

	signatory_name = settings["signatory_name"]
	signatory_title = settings["signatory_title"]
	if not signatory_name and doc.get("evaluator"):
		signatory_name = frappe.db.get_value("User", doc.get("evaluator"), "full_name") or ""
		signatory_title = signatory_title or _("Evaluator")

	qr = file_data_uri(doc.get("qr_code")) if doc.get("qr_code") else ""
	if not qr and doc.get("verification_url"):
		qr = qr_data_uri(doc.get("verification_url"))

	return {
		"background": background,
		"organisation": frappe.db.get_single_value("Website Settings", "app_name")
		or "Shatam Care Foundation",
		"title": settings["certificate_title"],
		"member_name": member_name,
		"member_size": _name_size(member_name),
		"course_title": course_title,
		"course_size": _course_size(course_title),
		"issue_date": issue_date,
		"certificate_uid": doc.get("certificate_uid") or "",
		"qr": qr,
		"signatory_name": signatory_name,
		"signatory_title": signatory_title,
	}


# The PDF engine falls back to a wide serif (DejaVu Serif) when Georgia/Times
# are missing, so sizes are worked out for that: a bold character is roughly
# 0.68 em wide (0.72 for bold italic), and the box is about 175 mm across.
BOX_WIDTH_MM = 175
MM_PER_PT = 0.3528


def _fit_pt(text, em_width, max_pt, min_pt):
    """Largest font size (pt) that keeps `text` on one line, within limits."""
    length = max(len(text or ""), 1)
    size = BOX_WIDTH_MM / (length * em_width * MM_PER_PT)
    return int(max(min_pt, min(max_pt, size)))


def _name_size(text):
    return _fit_pt(text, 0.72, 44, 18)


def _course_size(text):
    return _fit_pt(text, 0.68, 26, 14)


# --- Validating uploads -------------------------------------------------------


def validate_background_image(content):
	"""Reject images that would print badly. Raises a user-readable error."""
	if len(content) > MAX_BYTES:
		frappe.throw(_("The image is larger than {0} MB.").format(MAX_BYTES // (1024 * 1024)))

	try:
		from PIL import Image

		image = Image.open(io.BytesIO(content))
		image_format = image.format
		width, height = image.size
	except Exception:
		frappe.throw(_("This file is not a valid image. Please upload a PNG or JPG."))

	if image_format not in ALLOWED_FORMATS:
		frappe.throw(_("Please upload a PNG or JPG image."))

	target_ratio = TARGET_WIDTH_PX / TARGET_HEIGHT_PX
	if abs(width / height - target_ratio) / target_ratio > RATIO_TOLERANCE:
		frappe.throw(
			_(
				"The image is {0} x {1} px. It must be A4 landscape, the shape of "
				"{2} x {3} px."
			).format(width, height, TARGET_WIDTH_PX, TARGET_HEIGHT_PX)
		)

	if width < MIN_WIDTH_PX:
		frappe.throw(
			_("The image is too small ({0} px wide). Use at least {1} px, ideally {2} px.").format(
				width, MIN_WIDTH_PX, TARGET_WIDTH_PX
			)
		)


# --- Preview ------------------------------------------------------------------


def render_preview_pdf():
	"""A PDF of the current settings with sample data, without saving anything."""
	certificate_uid = "SCF-0000-000000"
	sample = frappe.new_doc("LMS Certificate")
	sample.update(
		{
			"member_name": "Sample Learner Name",
			"course_title": "Sample Course Title",
			"issue_date": frappe.utils.nowdate(),
			"certificate_uid": certificate_uid,
			"verification_url": f"{get_url()}/verify?id={certificate_uid}",
		}
	)
	# The sample is never saved, so there is no record to check print permission
	# against. The caller (admin_api.preview_certificate) has already required an
	# admin, and nothing real is exposed.
	sample.name = "PREVIEW"
	frappe.flags.ignore_print_permissions = True
	return frappe.get_print(
		"LMS Certificate", "PREVIEW", doc=sample, print_format=PRINT_FORMAT, as_pdf=True
	)
