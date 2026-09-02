"""Whitelisted API methods consumed by the custom Next.js frontend (token
auth — see ../../PLAN.md section 5). Kept thin: business logic that needs to
be shared with hooks/background jobs lives in certificate_eligibility.py /
certificate_issuance.py / content_review.py; this module is just the HTTP
surface.
"""

import frappe
from frappe import _

from shatam_care.shatam_care.capabilities import check_capability, has_capability, is_admin
from shatam_care.shatam_care.translations import (
	apply_checkpoint_translation,
	get_preferred_language,
)


@frappe.whitelist()
def get_lesson_checkpoints(lesson):
	"""Checkpoints for a lesson, plus whether the current user has already
	attempted each one — the frontend uses this to decide whether to enforce
	pause-and-answer on this watch-through (PLAN.md 3.3: first-watch only).

	Question/option text is served in the learner's chosen language when a
	translation exists (PLAN.md 3.2).
	"""
	member = frappe.session.user
	course = frappe.db.get_value("Course Lesson", lesson, "course")
	language = get_preferred_language(member, course)

	checkpoints = frappe.get_all(
		"LMS Video Checkpoint",
		filters={"lesson": lesson},
		fields=["name", "timestamp_seconds", "label", "question_text", "order"],
		order_by="timestamp_seconds asc",
	)
	attempted = set(
		frappe.get_all(
			"LMS Video Checkpoint Attempt",
			filters={"lesson": lesson, "member": member},
			pluck="checkpoint",
		)
	)
	for checkpoint in checkpoints:
		checkpoint["already_attempted"] = checkpoint.name in attempted
		if checkpoint["already_attempted"]:
			continue
		options = frappe.get_all(
			"LMS Video Checkpoint Option",
			filters={"parent": checkpoint.name, "parenttype": "LMS Video Checkpoint"},
			fields=["option_text"],
			order_by="idx asc",
		)
		question_text, options = apply_checkpoint_translation(checkpoint, options, language)
		checkpoint["question_text"] = question_text
		checkpoint["options"] = options
	return checkpoints


@frappe.whitelist()
def submit_checkpoint_attempt(checkpoint, selected_index):
	"""Record a checkpoint answer.

	Takes the option's *position*, not its text: a learner viewing a translated
	checkpoint would otherwise submit translated text that never matches the
	original options, marking every answer wrong. Resolving by index also means
	the stored `selected_option` is always in the canonical language, so reports
	stay comparable across languages.
	"""
	options = frappe.get_all(
		"LMS Video Checkpoint Option",
		filters={"parent": checkpoint, "parenttype": "LMS Video Checkpoint"},
		fields=["option_text"],
		order_by="idx asc",
	)
	selected_index = int(selected_index)
	if selected_index < 0 or selected_index >= len(options):
		frappe.throw(_("Invalid option selected."))

	attempt = frappe.new_doc("LMS Video Checkpoint Attempt")
	attempt.checkpoint = checkpoint
	attempt.member = frappe.session.user
	attempt.selected_option = options[selected_index].option_text
	attempt.insert()
	return {"is_correct": attempt.is_correct}


@frappe.whitelist()
def get_certificate_eligibility(course):
	name = frappe.db.get_value(
		"LMS Certificate Eligibility", {"member": frappe.session.user, "course": course}, "name"
	)
	if not name:
		return {"status": "Not Started"}
	return frappe.get_doc("LMS Certificate Eligibility", name).as_dict()


@frappe.whitelist()
def evaluator_queue():
	"""Certificates awaiting approval.

	Anyone holding the "certificates" capability sees every pending record —
	courses no longer need a named Course Evaluator for approvals to happen,
	which previously meant a course without one could strand its learners.
	Users without the capability fall back to the courses they are explicitly
	assigned to evaluate.
	"""
	check_capability("certificates")

	filters = {"status": "Eligible - Pending Approval"}
	if not (is_admin() or has_capability("certificates")):
		evaluator_names = frappe.get_all(
			"Course Evaluator", filters={"evaluator": frappe.session.user}, pluck="name"
		)
		if not evaluator_names:
			return []
		filters["evaluator"] = ["in", evaluator_names]

	return frappe.get_all(
		"LMS Certificate Eligibility",
		filters=filters,
		fields=["name", "member", "course", "auto_gated_on"],
		order_by="auto_gated_on asc",
	)


@frappe.whitelist()
def submit_lesson_for_review(lesson):
	doc = frappe.get_doc("Course Lesson", lesson)
	course = frappe.get_doc("LMS Course", doc.course)
	authored_by_me = any(row.instructor == frappe.session.user for row in course.instructors)
	if not (is_admin() or has_capability("content") or authored_by_me):
		frappe.throw(_("You can only submit your own lessons for review."), frappe.PermissionError)
	doc.review_status = "Submitted for Review"
	doc.save(ignore_permissions=True)
	return doc.review_status


@frappe.whitelist()
def review_lesson(lesson, decision, notes=None):
	check_capability("review")
	if decision not in ("Approved", "Rejected"):
		frappe.throw(_("Decision must be Approved or Rejected."))
	doc = frappe.get_doc("Course Lesson", lesson)
	doc.review_status = decision
	doc.review_notes = notes
	doc.save(ignore_permissions=True)
	return doc.review_status


@frappe.whitelist()
def pending_lesson_reviews():
	check_capability("review")
	return frappe.get_all(
		"Course Lesson",
		filters={"review_status": "Submitted for Review"},
		fields=["name", "title", "course", "submitted_on"],
		order_by="submitted_on asc",
	)


# --- Checkpoint authoring (teacher) ------------------------------------------


def _check_lesson_instructor(lesson):
	"""Allow admins, anyone delegated the "content" capability, or the course's
	own instructors. Capability first, since an evaluator trusted with content
	is not necessarily listed as an instructor on every course they maintain."""
	course = frappe.db.get_value("Course Lesson", lesson, "course")
	if is_admin() or has_capability("content"):
		return course
	instructors = frappe.get_all("Course Instructor", filters={"parent": course}, pluck="instructor")
	if frappe.session.user not in instructors:
		frappe.throw(_("You can only edit lessons on your own courses."), frappe.PermissionError)
	return course


@frappe.whitelist()
def get_checkpoint_detail(checkpoint):
	"""Full checkpoint incl. correct answers + existing translations — teacher
	view only (the learner-facing endpoint deliberately omits correctness)."""
	lesson = frappe.db.get_value("LMS Video Checkpoint", checkpoint, "lesson")
	_check_lesson_instructor(lesson)

	doc = frappe.get_doc("LMS Video Checkpoint", checkpoint)
	translations = frappe.get_all(
		"LMS Video Checkpoint Translation",
		filters={"checkpoint": checkpoint},
		fields=["name", "language", "question_text"],
	)
	for translation in translations:
		translation["options"] = frappe.get_all(
			"LMS Video Checkpoint Option",
			filters={"parent": translation.name, "parenttype": "LMS Video Checkpoint Translation"},
			fields=["option_text"],
			order_by="idx asc",
		)
	return {
		"name": doc.name,
		"label": doc.label,
		"timestamp_seconds": doc.timestamp_seconds,
		"question_text": doc.question_text,
		"options": [
			{"option_text": row.option_text, "is_correct": row.is_correct} for row in doc.options
		],
		"translations": translations,
	}


@frappe.whitelist()
def update_checkpoint(checkpoint, question_text=None, label=None, timestamp_seconds=None, options=None):
	lesson = frappe.db.get_value("LMS Video Checkpoint", checkpoint, "lesson")
	_check_lesson_instructor(lesson)

	doc = frappe.get_doc("LMS Video Checkpoint", checkpoint)
	if question_text is not None:
		doc.question_text = question_text
	if label is not None:
		doc.label = label
	if timestamp_seconds is not None:
		doc.timestamp_seconds = int(float(timestamp_seconds))
	if options is not None:
		parsed = frappe.parse_json(options)
		doc.options = []
		for option in parsed:
			doc.append(
				"options",
				{"option_text": option.get("option_text"), "is_correct": option.get("is_correct") and 1 or 0},
			)
	doc.save(ignore_permissions=True)
	return doc.name


@frappe.whitelist()
def delete_checkpoint(checkpoint):
	lesson = frappe.db.get_value("LMS Video Checkpoint", checkpoint, "lesson")
	_check_lesson_instructor(lesson)
	if frappe.db.exists("LMS Video Checkpoint Attempt", {"checkpoint": checkpoint}):
		frappe.throw(
			_("Learners have already answered this checkpoint, so it can no longer be deleted. Edit it instead.")
		)
	frappe.db.delete("LMS Video Checkpoint Translation", {"checkpoint": checkpoint})
	frappe.delete_doc("LMS Video Checkpoint", checkpoint, ignore_permissions=True)
	return checkpoint


@frappe.whitelist()
def save_checkpoint_translation(checkpoint, language, question_text, options):
	"""Create or replace the translation of a checkpoint for one language."""
	lesson = frappe.db.get_value("LMS Video Checkpoint", checkpoint, "lesson")
	_check_lesson_instructor(lesson)

	parsed = frappe.parse_json(options)
	existing = frappe.db.get_value(
		"LMS Video Checkpoint Translation", {"checkpoint": checkpoint, "language": language}, "name"
	)
	doc = (
		frappe.get_doc("LMS Video Checkpoint Translation", existing)
		if existing
		else frappe.new_doc("LMS Video Checkpoint Translation")
	)
	doc.checkpoint = checkpoint
	doc.language = language
	doc.question_text = question_text
	doc.options = []
	for option in parsed:
		doc.append("options", {"option_text": option})
	doc.save(ignore_permissions=True)
	return doc.name


# --- Certificates (learner) ---------------------------------------------------


@frappe.whitelist()
def my_certificates():
	rows = frappe.get_all(
		"LMS Certificate",
		filters={"member": frappe.session.user},
		fields=["name", "course", "course_title", "issue_date", "certificate_uid", "verification_url"],
		order_by="issue_date desc",
	)
	return rows


@frappe.whitelist()
def my_learner_state():
	"""Whether to show the learner UI (My Courses / My Certificates).

	The built-in `Administrator` account holds every role Frappe defines,
	including `LMS Student`, so gating the learner nav on that role alone gave
	it a learner dashboard it had no use for. Admins now see the learner UI
	only once they genuinely have learner data — enrolling to preview a course
	makes it appear, which is the only time it's useful to them.

	Plain students always see it: a learner with no enrolments still needs the
	catalogue to find their first course.
	"""
	from shatam_care.shatam_care.capabilities import is_admin

	user = frappe.session.user
	enrolments = frappe.db.count("LMS Enrollment", {"member": user})
	certificates = frappe.db.count("LMS Certificate", {"member": user})
	is_student = "LMS Student" in frappe.get_roles(user)

	return {
		"enrolments": enrolments,
		"certificates": certificates,
		"is_learner": bool(
			is_student and (not is_admin(user) or enrolments or certificates)
		),
	}
