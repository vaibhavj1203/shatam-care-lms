"""Final assessment (PLAN.md 3.4).

Deliberately thin: stock lms already implements quiz delivery and scoring
(`lms.lms.utils.get_quiz_with_questions` and
`lms.lms.doctype.lms_quiz.lms_quiz.submit_quiz`, which handles single/multi
choice, fuzzy-matched user input, negative marking, and creates the
`LMS Quiz Submission`). Rebuilding any of that would mean two scoring paths
that can drift, so this module only:

  1. finds the one quiz per course flagged `is_final_assessment`,
  2. overlays per-language question text, and
  3. reports whether the learner has already passed.

Submission goes straight to lms's own `submit_quiz`, whose insert fires our
`after_insert` hook -> certificate_eligibility.on_quiz_submission, which is
what flips the learner to "Eligible - Pending Approval".
"""

import frappe
from frappe import _

from shatam_care.shatam_care.translations import (
	apply_question_translation,
	get_preferred_language,
)


def get_final_assessment_quiz(course):
	return frappe.db.get_value("LMS Quiz", {"course": course, "is_final_assessment": 1}, "name")


@frappe.whitelist()
def get_final_assessment(course):
	"""Quiz + questions for a course's final assessment, in the learner's language."""
	from lms.lms.utils import get_quiz_with_questions

	quiz_name = get_final_assessment_quiz(course)
	if not quiz_name:
		return {"exists": False}

	member = frappe.session.user
	if not frappe.db.exists("LMS Enrollment", {"member": member, "course": course}):
		frappe.throw(_("You must be enrolled in this course to take the assessment."))

	data = get_quiz_with_questions(quiz_name)
	language = get_preferred_language(member, course)

	questions_by_name = data.get("questions_by_name") or {}
	for question_row in questions_by_name.values():
		apply_question_translation(question_row, language)

	previous = get_previous_attempts(quiz_name, member)
	quiz_doc = data.get("quiz") or {}

	return {
		"exists": True,
		"quiz": {
			"name": quiz_doc.get("name"),
			"title": quiz_doc.get("title"),
			"passing_percentage": quiz_doc.get("passing_percentage"),
			"total_marks": quiz_doc.get("total_marks"),
			"max_attempts": quiz_doc.get("max_attempts"),
			"duration": quiz_doc.get("duration"),
			"questions": quiz_doc.get("questions"),
		},
		"questions_by_name": questions_by_name,
		"attempts": previous,
		"has_passed": any(attempt["passed"] for attempt in previous),
		"attempts_used": len(previous),
	}


def get_previous_attempts(quiz_name, member):
	rows = frappe.get_all(
		"LMS Quiz Submission",
		filters={"quiz": quiz_name, "member": member},
		fields=["name", "score", "score_out_of", "percentage", "passing_percentage", "creation"],
		order_by="creation desc",
	)
	for row in rows:
		row["passed"] = (row.percentage or 0) >= (row.passing_percentage or 0)
	return rows


@frappe.whitelist()
def submit_final_assessment(course, results):
	"""Thin wrapper over lms's submit_quiz that resolves the course's final
	assessment and enforces max_attempts before delegating."""
	from lms.lms.doctype.lms_quiz.lms_quiz import submit_quiz

	quiz_name = get_final_assessment_quiz(course)
	if not quiz_name:
		frappe.throw(_("This course has no final assessment."))

	member = frappe.session.user
	if not frappe.db.exists("LMS Enrollment", {"member": member, "course": course}):
		frappe.throw(_("You must be enrolled in this course to take the assessment."))

	max_attempts = frappe.db.get_value("LMS Quiz", quiz_name, "max_attempts")
	if max_attempts:
		used = frappe.db.count("LMS Quiz Submission", {"quiz": quiz_name, "member": member})
		if used >= max_attempts:
			frappe.throw(_("You have used all {0} attempts for this assessment.").format(max_attempts))

	return submit_quiz(quiz_name, results)


@frappe.whitelist()
def set_language_preference(course, language):
	enrollment = frappe.db.get_value(
		"LMS Enrollment", {"member": frappe.session.user, "course": course}, "name"
	)
	if not enrollment:
		frappe.throw(_("You are not enrolled in this course."))
	frappe.db.set_value("LMS Enrollment", enrollment, "preferred_language", language)
	return language


@frappe.whitelist()
def get_available_languages():
	return frappe.get_all("Language", filters={"enabled": 1}, fields=["name", "language_name"])
