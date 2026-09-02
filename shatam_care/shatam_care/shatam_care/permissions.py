import frappe


def certificate_eligibility_query_conditions(user):
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if user == "Administrator" or "System Manager" in roles or "Moderator" in roles:
		return ""

	conditions = [f"`tabLMS Certificate Eligibility`.member = {frappe.db.escape(user)}"]
	if "Batch Evaluator" in roles:
		evaluator_names = frappe.get_all(
			"Course Evaluator", filters={"evaluator": user}, pluck="name"
		)
		if evaluator_names:
			evaluator_list = ", ".join(frappe.db.escape(name) for name in evaluator_names)
			conditions.append(f"`tabLMS Certificate Eligibility`.evaluator in ({evaluator_list})")

	return "(" + " or ".join(conditions) + ")"
