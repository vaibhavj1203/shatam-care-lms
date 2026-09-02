"""Course content: creation (with reference tables) and learner-safe reads.

Two things this module exists to get right, both found by driving the app as a
real student:

1. **Reference tables.** Chapters belong to a course through the
   `LMS Course.chapters` child table (`Chapter Reference`), and lessons to a
   chapter through `Course Chapter.lessons` (`Lesson Reference`). Setting the
   `course` / `chapter` link fields alone is NOT enough — no controller
   backfills the references, and every stock lms feature that walks a course
   (outline, next/previous lesson, progress recalculation) reads the reference
   tables. Content created without them is invisible to stock lms.

2. **Learner reads.** `Course Lesson` grants read to System Manager, Course
   Creator and Moderator only — not `LMS Student`. Students therefore cannot
   list or fetch lessons over `/api/resource/*`; they must come through these
   whitelisted methods, which verify enrollment and then read with elevated
   permissions.
"""

import frappe
from frappe import _

from shatam_care.shatam_care.capabilities import has_capability, is_admin


def _is_admin():
	return is_admin()


def _is_course_instructor(course):
	instructors = frappe.get_all("Course Instructor", filters={"parent": course}, pluck="instructor")
	return frappe.session.user in instructors


def _check_can_author(course):
	"""Authoring is allowed for admins, anyone delegated the "content"
	capability, and the course's own instructors."""
	if _is_admin() or has_capability("content") or _is_course_instructor(course):
		return
	frappe.throw(_("You cannot edit content on this course."), frappe.PermissionError)


def _check_can_view(course):
	"""Enrolled learners, the course's instructors, and admins. Raises otherwise."""
	if _is_admin() or has_capability("content") or _is_course_instructor(course):
		return
	if not frappe.db.exists("LMS Enrollment", {"course": course, "member": frappe.session.user}):
		frappe.throw(_("You must be enrolled in this course to view its content."), frappe.PermissionError)


def _view_state(course):
	"""Whether the caller may see this outline, and whether they're enrolled.

	Returns True if enrolled (or staff). Returns False — rather than raising —
	when the course is published and simply not joined yet, so the caller can
	render a preview with an Enrol button. Unpublished courses stay hidden
	from non-staff.
	"""
	if _is_admin() or has_capability("content") or _is_course_instructor(course):
		return True
	if frappe.db.exists("LMS Enrollment", {"course": course, "member": frappe.session.user}):
		return True
	if not frappe.db.get_value("LMS Course", course, "published"):
		frappe.throw(_("This course is not available."), frappe.PermissionError)
	return False


# --- Authoring ----------------------------------------------------------------


@frappe.whitelist()
def create_chapter(course, title):
	"""Create a chapter and register it in the course's `chapters` table."""
	_check_can_author(course)

	chapter = frappe.new_doc("Course Chapter")
	chapter.course = course
	chapter.title = title
	chapter.insert(ignore_permissions=True)

	course_doc = frappe.get_doc("LMS Course", course)
	if not any(row.chapter == chapter.name for row in course_doc.chapters):
		course_doc.append("chapters", {"chapter": chapter.name})
		course_doc.save(ignore_permissions=True)

	return {"name": chapter.name, "title": chapter.title}


@frappe.whitelist()
def get_or_create_chapter(course, title):
	_check_can_author(course)
	existing = frappe.db.get_value("Course Chapter", {"course": course, "title": title}, "name")
	if existing:
		# Backfill the reference if an earlier code path created the chapter
		# without one, otherwise the course outline stays empty.
		course_doc = frappe.get_doc("LMS Course", course)
		if not any(row.chapter == existing for row in course_doc.chapters):
			course_doc.append("chapters", {"chapter": existing})
			course_doc.save(ignore_permissions=True)
		return {"name": existing, "title": title}
	return create_chapter(course, title)


@frappe.whitelist()
def create_lesson(course, chapter, title, youtube=None, body=None):
	"""Create a lesson and register it in the chapter's `lessons` table."""
	_check_can_author(course)

	lesson = frappe.new_doc("Course Lesson")
	lesson.course = course
	lesson.chapter = chapter
	lesson.title = title
	if youtube:
		lesson.youtube = youtube
	if body:
		lesson.body = body
	lesson.insert(ignore_permissions=True)

	chapter_doc = frappe.get_doc("Course Chapter", chapter)
	if not any(row.lesson == lesson.name for row in chapter_doc.lessons):
		chapter_doc.append("lessons", {"lesson": lesson.name})
		chapter_doc.save(ignore_permissions=True)

	return {"name": lesson.name, "title": lesson.title}


# --- Learner reads ------------------------------------------------------------


@frappe.whitelist()
def list_published_courses():
	"""The course catalogue, for any signed-in user.

	`LMS Course` grants read only to System Manager / Course Creator /
	Moderator, so learners get a PermissionError from `/api/resource/LMS Course`
	— the same trap as `Course Lesson`. Read with elevated permissions after
	restricting to published courses, which are public by definition.

	Also flags which ones the caller is already enrolled in, so the catalogue
	can distinguish "continue" from "enrol".
	"""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please sign in to view courses."), frappe.PermissionError)

	courses = frappe.get_all(
		"LMS Course",
		filters={"published": 1},
		fields=["name", "title", "short_introduction", "image"],
		order_by="creation desc",
		ignore_permissions=True,
	)
	enrolled = set(
		frappe.get_all(
			"LMS Enrollment", filters={"member": frappe.session.user}, pluck="course"
		)
	)
	for course in courses:
		course["enrolled"] = course["name"] in enrolled
	return courses


@frappe.whitelist()
def get_course_content(course):
	"""Chapters + lessons for a course, flat.

	A learner who is not enrolled still gets the outline of a *published*
	course, with `enrolled: False`, so the page can offer to enrol them.
	Refusing outright meant clicking a course in the catalogue dead-ended on a
	permission error with no way forward. Lesson playback remains gated —
	`get_lesson_for_student` still requires enrolment.

	Ordered by the reference tables (the authored order), falling back to
	creation order for content that predates reference backfill.
	"""
	enrolled = _view_state(course)

	chapter_rows = frappe.get_all(
		"Chapter Reference",
		filters={"parent": course, "parenttype": "LMS Course"},
		fields=["chapter", "idx"],
		order_by="idx asc",
		ignore_permissions=True,
	)
	chapter_names = [r.chapter for r in chapter_rows]
	if not chapter_names:
		chapter_names = frappe.get_all(
			"Course Chapter", filters={"course": course}, pluck="name", ignore_permissions=True
		)

	chapters, lessons = [], []
	for idx, chapter_name in enumerate(chapter_names, start=1):
		title = frappe.db.get_value("Course Chapter", chapter_name, "title")
		chapters.append({"name": chapter_name, "title": title, "idx": idx})

		lesson_rows = frappe.get_all(
			"Lesson Reference",
			filters={"parent": chapter_name, "parenttype": "Course Chapter"},
			fields=["lesson", "idx"],
			order_by="idx asc",
			ignore_permissions=True,
		)
		lesson_names = [r.lesson for r in lesson_rows] or frappe.get_all(
			"Course Lesson", filters={"chapter": chapter_name}, pluck="name", ignore_permissions=True
		)
		for lesson_idx, lesson_name in enumerate(lesson_names, start=1):
			detail = frappe.db.get_value(
				"Course Lesson", lesson_name, ["title", "youtube"], as_dict=True
			)
			lessons.append(
				{
					"name": lesson_name,
					"title": detail.title if detail else lesson_name,
					"youtube": detail.youtube if detail else None,
					"chapter": chapter_name,
					"idx": lesson_idx,
				}
			)

	course_detail = frappe.db.get_value(
		"LMS Course", course, ["title", "short_introduction"], as_dict=True
	)
	return {
		"title": course_detail.title if course_detail else course,
		"short_introduction": course_detail.short_introduction if course_detail else None,
		"chapters": chapters,
		"lessons": lessons,
		# False = published course the caller hasn't joined; the page shows the
		# outline plus an Enrol button rather than an error.
		"enrolled": enrolled,
	}


@frappe.whitelist()
def get_lesson_for_student(lesson):
	"""Single lesson for the player. Students have no read permission on
	`Course Lesson`, so this is the only way they can load one."""
	course = frappe.db.get_value("Course Lesson", lesson, "course")
	if not course:
		frappe.throw(_("Lesson not found."))
	_check_can_view(course)

	return frappe.db.get_value(
		"Course Lesson", lesson, ["name", "title", "course", "chapter", "youtube"], as_dict=True
	)


@frappe.whitelist()
def courses_i_can_author():
	"""Courses to show on the Content screen.

	Admins and anyone holding "content" get every course — an admin was
	previously told "you aren't an instructor on any course", which is wrong:
	full rights should never be narrower than a delegated subset. Everyone
	else sees only courses they're listed as an instructor on.
	"""
	from shatam_care.shatam_care.capabilities import has_capability, is_admin

	if is_admin() or has_capability("content"):
		names = frappe.get_all("LMS Course", pluck="name", order_by="creation desc")
	else:
		names = list({
			row.parent
			for row in frappe.get_all(
				"Course Instructor",
				filters={"instructor": frappe.session.user},
				fields=["parent"],
			)
		})
	if not names:
		return []
	return frappe.get_all(
		"LMS Course",
		filters={"name": ["in", names]},
		fields=["name", "title", "short_introduction", "published"],
		order_by="creation desc",
	)
