import frappe
from frappe import _
from frappe.model.document import Document


class LMSVideoCheckpoint(Document):
	def validate(self):
		self.validate_at_least_one_correct_option()
		self.validate_timestamp_within_lesson()

	def validate_at_least_one_correct_option(self):
		if not any(row.is_correct for row in self.options):
			frappe.throw(_("At least one option must be marked correct."))

	def validate_timestamp_within_lesson(self):
		if self.timestamp_seconds < 0:
			frappe.throw(_("Timestamp cannot be negative."))
