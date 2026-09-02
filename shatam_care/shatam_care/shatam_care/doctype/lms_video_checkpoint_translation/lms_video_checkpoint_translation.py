import frappe
from frappe import _
from frappe.model.document import Document


class LMSVideoCheckpointTranslation(Document):
	def validate(self):
		self.validate_no_duplicate_translation()
		self.validate_option_count_matches_original()

	def validate_no_duplicate_translation(self):
		existing = frappe.db.exists(
			"LMS Video Checkpoint Translation",
			{"checkpoint": self.checkpoint, "language": self.language, "name": ["!=", self.name]},
		)
		if existing:
			frappe.throw(_("A translation for this checkpoint in this language already exists."))

	def validate_option_count_matches_original(self):
		# Translated options are matched to the original by position, so the
		# original's is_correct flags apply without needing to be re-entered here.
		original_count = frappe.db.count(
			"LMS Video Checkpoint Option",
			{"parent": self.checkpoint, "parenttype": "LMS Video Checkpoint"},
		)
		if len(self.options) != original_count:
			frappe.throw(
				_("Number of translated options ({0}) must match the original checkpoint's options ({1}).").format(
					len(self.options), original_count
				)
			)
