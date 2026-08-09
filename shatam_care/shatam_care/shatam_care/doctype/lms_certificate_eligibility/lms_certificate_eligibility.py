import frappe
from frappe.model.document import Document


class LMSCertificateEligibility(Document):
	def has_permission(self, permtype="read", verbose=False):
		"""Row-level access on top of the doctype's role permissions.

		Signature must match `Document.has_permission(permtype, verbose)` — this
		overrides it, so it is the method Frappe consults for every read/write.

		The `flags.ignore_permissions` short-circuit is essential, not
		boilerplate: overriding this method without it silently disables
		`ignore_permissions=True` for this doctype, which breaks all trusted
		server-side writes. The auto-gate runs inside hooks fired by *student*
		actions, and students deliberately have no write access here (otherwise
		they could self-certify), so without this the gate could never record
		eligibility at all.
		"""
		if self.flags.ignore_permissions:
			return True

		user = frappe.session.user
		roles = frappe.get_roles(user)

		if user == "Administrator" or "System Manager" in roles or "Moderator" in roles:
			return True

		# Learners may read their own record, never write it.
		if self.member == user:
			return permtype == "read"

		# Evaluators act only on courses they are assigned to.
		if "Batch Evaluator" in roles and self.evaluator:
			return frappe.db.get_value("Course Evaluator", self.evaluator, "evaluator") == user

		return False
