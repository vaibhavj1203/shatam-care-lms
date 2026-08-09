"""Auto-gate + evaluator-approval certificate flow.

Replaces stock lms's live-oral-evaluation-booking flow (`LMS Certificate
Request`) — see ../../PLAN.md section 3.5 and ../../SCHEMA.md for the design
this implements. Three criteria must all be true before a student's
certificate becomes available for evaluator approval:

1. Every `Course Lesson` in the course has a `Complete` `LMS Course Progress`
   row for the member.
2. Every `LMS Video Checkpoint` in the course has an
   `LMS Video Checkpoint Attempt` row for the member (first-watch enforcement
   means "attempted" is enough — right or wrong, per PLAN.md 3.3).
3. The course's final-assessment quiz (`LMS Quiz.is_final_assessment`) has a
   passing `LMS Quiz Submission` for the member.
"""

import frappe
from frappe.utils import now_datetime


def on_progress_update(doc, method=None):
	evaluate_eligibility(doc.member, doc.course)


def on_quiz_submission(doc, method=None):
	is_final = frappe.db.get_value("LMS Quiz", doc.quiz, "is_final_assessment")
	if is_final and doc.percentage >= doc.passing_percentage:
		evaluate_eligibility(doc.member, doc.course)


def evaluate_eligibility(member, course):
	total_lessons = frappe.db.count("Course Lesson", {"course": course})
	completed_lessons = frappe.db.count(
		"LMS Course Progress", {"course": course, "member": member, "status": "Complete"}
	)
	all_lessons_completed = total_lessons > 0 and completed_lessons >= total_lessons

	total_checkpoints = frappe.db.count("LMS Video Checkpoint", {"course": course})
	attempted_checkpoints = frappe.db.count(
		"LMS Video Checkpoint Attempt", {"course": course, "member": member}
	)
	all_checkpoints_passed = total_checkpoints == 0 or attempted_checkpoints >= total_checkpoints

	final_submission = get_passing_final_assessment_submission(member, course)

	record_name = frappe.db.get_value(
		"LMS Certificate Eligibility", {"member": member, "course": course}, "name"
	)
	doc = (
		frappe.get_doc("LMS Certificate Eligibility", record_name)
		if record_name
		else frappe.new_doc("LMS Certificate Eligibility")
	)
	doc.member = member
	doc.course = course
	doc.all_lessons_completed = 1 if all_lessons_completed else 0
	doc.all_checkpoints_passed = 1 if all_checkpoints_passed else 0
	doc.final_assessment_submission = final_submission

	newly_eligible = all_lessons_completed and all_checkpoints_passed and final_submission
	if newly_eligible and doc.status in (None, "Pending Auto-Gate"):
		doc.status = "Eligible - Pending Approval"
		doc.auto_gated_on = now_datetime()
	elif not doc.status:
		doc.status = "Pending Auto-Gate"

	# This runs inside hooks fired by *student* actions (progress saved, quiz
	# submitted), and students must never hold write permission on eligibility
	# records — that would let them self-certify. Set the flag on the document
	# rather than only passing it to save(): for a new doc, save() routes to
	# insert(), which re-runs its own permission check and does not inherit the
	# keyword argument.
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)
	return doc


def get_passing_final_assessment_submission(member, course):
	final_quiz = frappe.db.get_value(
		"LMS Quiz", {"course": course, "is_final_assessment": 1}, "name"
	)
	if not final_quiz:
		return None
	submissions = frappe.get_all(
		"LMS Quiz Submission",
		filters={"quiz": final_quiz, "member": member},
		fields=["name", "percentage", "passing_percentage"],
		order_by="creation desc",
	)
	for submission in submissions:
		if submission.percentage >= submission.passing_percentage:
			return submission.name
	return None


@frappe.whitelist()
def approve_certificate(eligibility_name):
	doc = frappe.get_doc("LMS Certificate Eligibility", eligibility_name)
	_check_is_assigned_evaluator(doc)
	if doc.status != "Eligible - Pending Approval":
		frappe.throw(frappe._("Only records pending approval can be approved."))

	from shatam_care.shatam_care.certificate_issuance import issue_certificate

	certificate = issue_certificate(doc.member, doc.course, doc.evaluator)

	doc.status = "Approved"
	doc.reviewed_by = frappe.session.user
	doc.reviewed_on = now_datetime()
	doc.certificate = certificate.name
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)
	return doc


@frappe.whitelist()
def reject_certificate(eligibility_name, reason):
	doc = frappe.get_doc("LMS Certificate Eligibility", eligibility_name)
	_check_is_assigned_evaluator(doc)
	if doc.status != "Eligible - Pending Approval":
		frappe.throw(frappe._("Only records pending approval can be rejected."))

	doc.status = "Rejected"
	doc.reviewed_by = frappe.session.user
	doc.reviewed_on = now_datetime()
	doc.rejection_reason = reason
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)
	return doc


def _check_is_assigned_evaluator(doc):
	if "System Manager" in frappe.get_roles() or "Moderator" in frappe.get_roles():
		return
	evaluator_user = frappe.db.get_value("Course Evaluator", doc.evaluator, "evaluator")
	if evaluator_user != frappe.session.user:
		frappe.throw(frappe._("You are not the assigned evaluator for this course."), frappe.PermissionError)
