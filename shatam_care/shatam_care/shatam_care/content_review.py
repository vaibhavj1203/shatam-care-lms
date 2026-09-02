"""Draft -> Submitted for Review -> Approved/Rejected workflow for teacher-
authored lessons, via a Custom Field on stock lms's `Course Lesson`
(see ../../SCHEMA.md). Only System Manager/Moderator may approve/reject;
teachers (Course Creator) may only move a lesson into review.
"""

import frappe
from frappe.utils import now_datetime

REVIEWER_ROLES = ("System Manager", "Moderator")


def validate_lesson_review_status(doc, method=None):
	if not doc.has_value_changed("review_status"):
		return

	roles = frappe.get_roles()
	is_reviewer = any(role in roles for role in REVIEWER_ROLES)

	if doc.review_status == "Submitted for Review":
		doc.submitted_on = now_datetime()
	elif doc.review_status in ("Approved", "Rejected"):
		if not is_reviewer:
			frappe.throw(frappe._("Only an admin can approve or reject a lesson."))
		doc.reviewed_by = frappe.session.user
		doc.reviewed_on = now_datetime()
