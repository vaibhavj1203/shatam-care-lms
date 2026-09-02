"""Per-language text overlays.

Per PLAN.md 3.2, video itself is handled by YouTube's own dubbed audio tracks —
only *text* (checkpoint questions, assessment questions, options) needs
per-language variants. These helpers overlay a translation onto the default
content when one exists for the learner's chosen language, and silently fall
back to the original otherwise, so a partially-translated course still works.
"""

import frappe

# LMS Question stores choices as flat option_1..option_4 / explanation_1..4
# fields (not a child table) — see SCHEMA.md's correction note.
OPTION_FIELDS = [f"option_{i}" for i in range(1, 5)]
EXPLANATION_FIELDS = [f"explanation_{i}" for i in range(1, 5)]


def get_preferred_language(member, course):
	"""Language the learner picked for this course, if any."""
	return frappe.db.get_value(
		"LMS Enrollment", {"member": member, "course": course}, "preferred_language"
	)


def apply_question_translation(question_row, language):
	"""Overlay a translated LMS Question onto its default text, in place.

	`question_row` is a dict shaped like lms's get_quiz_with_questions output
	(name/question/type/multiple/option_*/explanation_*). Correctness flags are
	deliberately NOT translated — they live only on the original question, so a
	translation can never change which answer is right.
	"""
	if not language:
		return question_row

	translation = frappe.db.get_value(
		"LMS Question Translation",
		{"question": question_row.get("name"), "language": language},
		["question_text", *OPTION_FIELDS, *EXPLANATION_FIELDS],
		as_dict=True,
	)
	if not translation:
		return question_row

	if translation.get("question_text"):
		question_row["question"] = translation["question_text"]
	for field in OPTION_FIELDS + EXPLANATION_FIELDS:
		if translation.get(field):
			question_row[field] = translation[field]
	return question_row


def apply_checkpoint_translation(checkpoint, options, language):
	"""Return (question_text, options) translated if a variant exists.

	Checkpoint options are matched to the original by row position — the
	translation doctype validates that the option count matches, so index
	alignment holds and `is_correct` never has to be restated per language.
	"""
	if not language:
		return checkpoint.get("question_text"), options

	translation = frappe.db.get_value(
		"LMS Video Checkpoint Translation",
		{"checkpoint": checkpoint.get("name"), "language": language},
		["name", "question_text"],
		as_dict=True,
	)
	if not translation:
		return checkpoint.get("question_text"), options

	translated_options = frappe.get_all(
		"LMS Video Checkpoint Option",
		filters={"parent": translation.name, "parenttype": "LMS Video Checkpoint Translation"},
		fields=["option_text"],
		order_by="idx asc",
	)
	if len(translated_options) != len(options):
		# Shouldn't happen (the doctype validates this), but if the data is
		# inconsistent, showing the original is safer than showing mismatched
		# options that no longer line up with the correct answer.
		return translation.question_text or checkpoint.get("question_text"), options

	return translation.question_text or checkpoint.get("question_text"), translated_options
