import frappe
from frappe.model.document import Document


class ShatamCertificateSettings(Document):
	"""Single record holding what an admin can change about issued certificates:
	the background image and the few lines of text that are not per-learner.

	The look itself lives in the "Shatam Certificate" Print Format; this record
	only feeds it. See certificate_template.py for how it is read at render time.
	"""

	pass
