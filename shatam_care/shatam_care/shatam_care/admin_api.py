"""Admin/moderator management APIs.

Covers the setup work that has to happen before any learning can occur:
creating courses, assigning teachers and the per-course evaluator, building the
final assessment, and registering learners (including the assisted-signup
fallback from PLAN.md 3.7, for learners who can't self-serve).

Everything here is gated to Moderator/System Manager. Frappe's desk UI can do
all of this too, but tier-3 field admins shouldn't have to learn the desk.
"""

import frappe
from frappe import _
from frappe.utils import random_string

ADMIN_ROLES = ("System Manager", "Moderator")


def check_admin():
	if not any(role in frappe.get_roles() for role in ADMIN_ROLES):
		frappe.throw(_("Not permitted."), frappe.PermissionError)


# --- Courses -----------------------------------------------------------------


@frappe.whitelist()
def list_all_courses():
	check_admin()
	courses = frappe.get_all(
		"LMS Course",
		fields=["name", "title", "short_introduction", "published", "evaluator"],
		order_by="creation desc",
	)
	for course in courses:
		course["lesson_count"] = frappe.db.count("Course Lesson", {"course": course.name})
		course["enrollment_count"] = frappe.db.count("LMS Enrollment", {"course": course.name})
		course["has_final_assessment"] = bool(
			frappe.db.exists("LMS Quiz", {"course": course.name, "is_final_assessment": 1})
		)
	return courses


@frappe.whitelist()
def create_course(title, short_introduction=None, description=None):
	"""Create a course. `instructors` is mandatory on LMS Course, so seed it with
	the creating admin — they can add real teachers and remove themselves after."""
	check_admin()
	course = frappe.new_doc("LMS Course")
	course.title = title
	course.short_introduction = short_introduction
	course.description = description or short_introduction or title
	course.published = 0
	course.append("instructors", {"instructor": frappe.session.user})
	course.insert()
	return course.name


@frappe.whitelist()
def update_course(course, title=None, short_introduction=None, description=None, published=None):
	check_admin()
	doc = frappe.get_doc("LMS Course", course)
	if title is not None:
		doc.title = title
	if short_introduction is not None:
		doc.short_introduction = short_introduction
	if description is not None:
		doc.description = description
	if published is not None:
		doc.published = 1 if str(published) in ("1", "true", "True") else 0
	doc.save()
	return doc.name


@frappe.whitelist()
def get_course_admin_detail(course):
	check_admin()
	doc = frappe.get_doc("LMS Course", course)
	instructors = [row.instructor for row in doc.instructors]
	instructor_details = (
		frappe.get_all(
			"User", filters={"name": ["in", instructors]}, fields=["name", "full_name"]
		)
		if instructors
		else []
	)
	evaluator_user = (
		frappe.db.get_value("Course Evaluator", doc.evaluator, "evaluator") if doc.evaluator else None
	)
	final_quiz = frappe.db.get_value(
		"LMS Quiz", {"course": course, "is_final_assessment": 1}, ["name", "title"], as_dict=True
	)
	return {
		"name": doc.name,
		"title": doc.title,
		"short_introduction": doc.short_introduction,
		"published": doc.published,
		"instructors": instructor_details,
		"evaluator": doc.evaluator,
		"evaluator_user": evaluator_user,
		"final_assessment": final_quiz,
		"lesson_count": frappe.db.count("Course Lesson", {"course": course}),
	}


@frappe.whitelist()
def add_instructor(course, user):
	check_admin()
	doc = frappe.get_doc("LMS Course", course)
	if any(row.instructor == user for row in doc.instructors):
		return doc.name
	doc.append("instructors", {"instructor": user})
	doc.save()
	_ensure_role(user, "Course Creator")
	return doc.name


@frappe.whitelist()
def remove_instructor(course, user):
	check_admin()
	doc = frappe.get_doc("LMS Course", course)
	doc.instructors = [row for row in doc.instructors if row.instructor != user]
	doc.save()
	return doc.name


@frappe.whitelist()
def set_course_evaluator(course, user):
	"""Assign the per-course evaluator who signs off certificates (PLAN.md 3.5).

	`LMS Course.evaluator` links to Course Evaluator (not User), so create that
	record on demand — admins shouldn't have to know about the indirection.
	"""
	check_admin()
	evaluator = frappe.db.get_value("Course Evaluator", {"evaluator": user}, "name")
	if not evaluator:
		evaluator_doc = frappe.new_doc("Course Evaluator")
		evaluator_doc.evaluator = user
		evaluator_doc.insert()
		evaluator = evaluator_doc.name
	frappe.db.set_value("LMS Course", course, "evaluator", evaluator)
	_ensure_role(user, "Batch Evaluator")
	return evaluator


# --- Final assessment --------------------------------------------------------


@frappe.whitelist()
def create_final_assessment(course, title, passing_percentage=70):
	"""Create the one quiz per course that gates certification.

	`course` must be set on the quiz: LMS Quiz Submission fetches its own
	`course` field from `quiz.course`, and the eligibility auto-gate reads that
	— a quiz without it would silently never certify anyone.
	"""
	check_admin()
	existing = frappe.db.exists("LMS Quiz", {"course": course, "is_final_assessment": 1})
	if existing:
		frappe.throw(_("This course already has a final assessment."))

	quiz = frappe.new_doc("LMS Quiz")
	quiz.title = title
	quiz.course = course
	quiz.is_final_assessment = 1
	quiz.passing_percentage = passing_percentage
	quiz.show_answers = 0
	quiz.insert()

	# LMSQuiz.calculate_total_marks() forces passing_percentage to 100 whenever
	# the quiz has no questions — which is always true at creation, so the
	# admin's chosen pass mark is silently replaced with "must score 100%".
	# db_set writes past validate(); once a question exists, later saves leave
	# the value alone.
	quiz.db_set("passing_percentage", passing_percentage, update_modified=False)
	return quiz.name


@frappe.whitelist()
def update_assessment(quiz, passing_percentage=None, title=None):
	"""Edit the final assessment after creation (notably the pass mark)."""
	check_admin()
	doc = frappe.get_doc("LMS Quiz", quiz)
	if title is not None:
		doc.title = title
	doc.save()
	if passing_percentage is not None:
		# Same reason as above: bypass validate so an empty quiz keeps the value.
		doc.db_set("passing_percentage", int(passing_percentage), update_modified=False)
	return doc.name


@frappe.whitelist()
def add_assessment_question(
	quiz, question_text, options, correct_indexes, marks=1, explanations=None
):
	"""Create an LMS Question and attach it to the quiz.

	LMS Question stores choices as flat option_1..4 / is_correct_1..4 fields.
	"""
	check_admin()
	options = frappe.parse_json(options)
	correct_indexes = {int(i) for i in frappe.parse_json(correct_indexes)}
	explanations = frappe.parse_json(explanations) if explanations else []

	if not options:
		frappe.throw(_("At least one option is required."))
	if len(options) > 4:
		frappe.throw(_("A question can have at most 4 options."))
	if not correct_indexes:
		frappe.throw(_("Mark at least one option as correct."))

	question = frappe.new_doc("LMS Question")
	question.question = question_text
	question.type = "Choices"
	question.multiple = 1 if len(correct_indexes) > 1 else 0
	for i, option in enumerate(options):
		question.set(f"option_{i + 1}", option)
		question.set(f"is_correct_{i + 1}", 1 if i in correct_indexes else 0)
		if i < len(explanations) and explanations[i]:
			question.set(f"explanation_{i + 1}", explanations[i])
	question.insert()

	quiz_doc = frappe.get_doc("LMS Quiz", quiz)
	quiz_doc.append("questions", {"question": question.name, "marks": marks, "type": "Choices"})
	quiz_doc.save()
	return question.name


@frappe.whitelist()
def get_assessment_questions(quiz):
	check_admin()
	quiz_doc = frappe.get_doc("LMS Quiz", quiz)
	names = [row.question for row in quiz_doc.questions]
	if not names:
		return []
	return frappe.get_all(
		"LMS Question",
		filters={"name": ["in", names]},
		fields=["name", "question", "type", "multiple"] + [f"option_{i}" for i in range(1, 5)],
	)


@frappe.whitelist()
def remove_assessment_question(quiz, question):
	check_admin()
	quiz_doc = frappe.get_doc("LMS Quiz", quiz)
	quiz_doc.questions = [row for row in quiz_doc.questions if row.question != question]
	quiz_doc.save()
	return quiz


# --- Learners ----------------------------------------------------------------


@frappe.whitelist()
def list_students(course=None, student_group=None):
	check_admin()
	filters = {}
	if course:
		filters["course"] = course
	if student_group:
		filters["student_group"] = student_group
	return frappe.get_all(
		"LMS Enrollment",
		filters=filters,
		fields=[
			"name",
			"member",
			"member_name",
			"course",
			"progress",
			"student_group",
			"preferred_language",
		],
		order_by="creation desc",
	)


@frappe.whitelist()
def create_student(email, full_name, mobile_no=None, password=None):
	"""Assisted signup (PLAN.md 3.7): an admin registers a learner who can't
	self-serve. Returns a generated password to hand over if none was given."""
	check_admin()
	if frappe.db.exists("User", email):
		user = frappe.get_doc("User", email)
		_ensure_role(email, "LMS Student")
		return {"user": user.name, "password": None, "existed": True}

	generated = password or random_string(10)
	parts = full_name.strip().split(" ", 1)
	user = frappe.new_doc("User")
	user.email = email
	user.first_name = parts[0]
	if len(parts) > 1:
		user.last_name = parts[1]
	if mobile_no:
		user.mobile_no = mobile_no
	user.send_welcome_email = 0
	user.new_password = generated
	user.insert(ignore_permissions=True)
	_ensure_role(email, "LMS Student")
	return {"user": user.name, "password": generated, "existed": False}


VALID_ROLES = ("LMS Student", "Course Creator", "Batch Evaluator", "Moderator")


@frappe.whitelist()
def create_user(email, full_name, roles, mobile_no=None, password=None):
	"""Create a staff account with an explicit set of roles.

	Distinct from `create_student`, which always grants `LMS Student`. Using
	that to create teachers and evaluators gives them the learner navigation —
	course catalogue, enrolment, certificates — which is confusing and wrong:
	being able to teach a course is not the same as being enrolled on one. If
	a staff member should also take courses, grant `LMS Student` explicitly.
	"""
	check_admin()
	roles = frappe.parse_json(roles) if isinstance(roles, str) else roles
	unknown = [r for r in roles if r not in VALID_ROLES]
	if unknown:
		frappe.throw(_("Unknown role(s): {0}").format(", ".join(unknown)))

	generated = password or random_string(10)
	if frappe.db.exists("User", email):
		user_doc = frappe.get_doc("User", email)
		existed = True
	else:
		parts = full_name.strip().split(" ", 1)
		user_doc = frappe.new_doc("User")
		user_doc.email = email
		user_doc.first_name = parts[0]
		if len(parts) > 1:
			user_doc.last_name = parts[1]
		user_doc.send_welcome_email = 0
		user_doc.new_password = generated
		existed = False
	if mobile_no:
		user_doc.mobile_no = mobile_no
	user_doc.save(ignore_permissions=True) if existed else user_doc.insert(ignore_permissions=True)

	set_user_roles(email, roles)
	return {"user": email, "password": None if existed else generated, "existed": existed}


@frappe.whitelist()
def set_user_roles(user, roles):
	"""Replace the app-managed roles on a user, leaving unrelated roles alone."""
	check_admin()
	roles = set(frappe.parse_json(roles) if isinstance(roles, str) else roles)
	unknown = [r for r in roles if r not in VALID_ROLES]
	if unknown:
		frappe.throw(_("Unknown role(s): {0}").format(", ".join(unknown)))

	user_doc = frappe.get_doc("User", user)
	# Only touch the roles this app owns; anything else on the account stays.
	user_doc.roles = [r for r in user_doc.roles if r.role not in VALID_ROLES]
	for role in roles:
		user_doc.append("roles", {"role": role})
	user_doc.save(ignore_permissions=True)
	return sorted(roles)


@frappe.whitelist()
def reset_password(user, password=None):
	"""Set a learner's password on their behalf.

	Learners in the field routinely lose credentials and often have no working
	email for a reset link, so an admin/coordinator needs to be able to hand
	them a new one directly. Returns the password so it can be shown once.
	"""
	check_admin()
	if user in ("Administrator",):
		frappe.throw(_("Refusing to reset the Administrator password from the API."))

	new_password = password or random_string(10)
	user_doc = frappe.get_doc("User", user)
	user_doc.new_password = new_password
	user_doc.save(ignore_permissions=True)
	return {"user": user, "password": new_password}


@frappe.whitelist()
def enroll_student(course, member, student_group=None, preferred_language=None):
	check_admin()
	existing = frappe.db.get_value("LMS Enrollment", {"course": course, "member": member}, "name")
	if existing:
		enrollment = frappe.get_doc("LMS Enrollment", existing)
	else:
		enrollment = frappe.new_doc("LMS Enrollment")
		enrollment.course = course
		enrollment.member = member
		enrollment.member_type = "Student"
	if student_group:
		enrollment.student_group = student_group
	if preferred_language:
		enrollment.preferred_language = preferred_language
	enrollment.save(ignore_permissions=True)
	return enrollment.name


@frappe.whitelist()
def search_users(query, limit=20):
	check_admin()
	return frappe.get_all(
		"User",
		filters=[
			["enabled", "=", 1],
			["name", "not in", ["Administrator", "Guest"]],
			["full_name", "like", f"%{query}%"],
		],
		fields=["name", "full_name"],
		limit_page_length=limit,
	)


def _ensure_role(user, role):
	user_doc = frappe.get_doc("User", user)
	if not any(row.role == role for row in user_doc.roles):
		user_doc.append("roles", {"role": role})
		user_doc.save(ignore_permissions=True)
