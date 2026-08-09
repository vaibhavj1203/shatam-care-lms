import frappe
from frappe import _
from frappe.model.document import Document


class LMSQuestionTranslation(Document):
	def validate(self):
		existing = frappe.db.exists(
			"LMS Question Translation",
			{"question": self.question, "language": self.language, "name": ["!=", self.name]},
		)
		if existing:
			frappe.throw(_("A translation for this question in this language already exists."))
