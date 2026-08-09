import frappe
from frappe import _
from frappe.model.document import Document


class LMSVideoCheckpointAttempt(Document):
	def validate(self):
		self.member = self.member or frappe.session.user
		self.check_duplicate_attempt()
		self.set_is_correct()

	def check_duplicate_attempt(self):
		existing = frappe.db.exists(
			"LMS Video Checkpoint Attempt",
			{"checkpoint": self.checkpoint, "member": self.member, "name": ["!=", self.name]},
		)
		if existing:
			frappe.throw(_("This checkpoint has already been attempted by this member."))

	def set_is_correct(self):
		correct_options = frappe.get_all(
			"LMS Video Checkpoint Option",
			filters={"parent": self.checkpoint, "parenttype": "LMS Video Checkpoint", "is_correct": 1},
			pluck="option_text",
		)
		self.is_correct = 1 if self.selected_option in correct_options else 0
