"""Copy the legacy single evaluator into the multi-evaluator table.

Courses can now have several evaluators, held in the `shatam_evaluators` child
table. Courses created before that field existed still carry their evaluator in
stock `LMS Course.evaluator` only, so the admin screen showed "Nobody assigned
yet" for them — the assignment was there, just not where the UI looks.

Idempotent: skips any course that already has table rows.
"""

import frappe


def execute():
	if not frappe.db.has_column("LMS Course", "evaluator"):
		return

	courses = frappe.get_all(
		"LMS Course", filters={"evaluator": ["is", "set"]}, fields=["name", "evaluator"]
	)
	migrated = 0
	for course in courses:
		already = frappe.db.count(
			"LMS Course Evaluator", {"parent": course.name, "parenttype": "LMS Course"}
		)
		if already:
			continue

		# LMS Course.evaluator links to Course Evaluator, not User — resolve it.
		user = frappe.db.get_value("Course Evaluator", course.evaluator, "evaluator")
		if not user or not frappe.db.exists("User", user):
			continue

		doc = frappe.get_doc("LMS Course", course.name)
		doc.append("shatam_evaluators", {"evaluator": user})
		doc.save(ignore_permissions=True)
		migrated += 1

	if migrated:
		frappe.db.commit()
	print(f"backfill_course_evaluators: migrated {migrated} course(s)")
