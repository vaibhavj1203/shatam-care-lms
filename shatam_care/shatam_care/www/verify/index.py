import frappe

no_cache = 1


def get_context(context):
	context.no_cache = 1
	certificate_uid = frappe.form_dict.get("id")
	context.certificate_uid = certificate_uid
	context.certificate = None

	if certificate_uid:
		certificate = frappe.db.get_value(
			"LMS Certificate",
			{"certificate_uid": certificate_uid},
			["member_name", "course_title", "issue_date", "name"],
			as_dict=True,
		)
		context.certificate = certificate
	return context
