"""Per-user capabilities.

Three personas (see PLAN.md 2, revised 2026-08-11):

  Admin      — every capability, implicitly.
  Student    — learner only; holds no capabilities.
  Evaluator  — an admin-configurable subset of the admin's rights. This is why
               capabilities exist at all: "evaluator" is not a fixed job, it's
               whatever the admin delegates. One might only approve
               certificates; another might run courses and enrol learners.

Capabilities are stored per user, not per role, because two evaluators at
different centres may legitimately be trusted with different things.
"""

import json

import frappe
from frappe import _

# Keep this list short and meaningful — each entry is a checkbox an admin has
# to reason about. The label/description are what they read in the UI.
CAPABILITIES = {
	"courses": {
		"label": "Manage courses",
		"description": "Create, edit and publish courses and their final assessments",
	},
	"content": {
		"label": "Author content",
		"description": "Add chapters, lessons and in-video quiz checkpoints",
	},
	"review": {
		"label": "Review content",
		"description": "Approve or reject lessons submitted for review",
	},
	"certificates": {
		"label": "Approve certificates",
		"description": "Review eligible learners and issue their certificates",
	},
	"people": {
		"label": "Manage people",
		"description": "Create accounts, reset passwords, enrol learners and manage groups",
	},
}

ADMIN_ROLES = ("System Manager", "Moderator")
CAPABILITY_FIELD = "shatam_capabilities"


def is_admin(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	return any(role in frappe.get_roles(user) for role in ADMIN_ROLES)


def get_capabilities(user=None):
	"""Every capability for an admin; the stored set for anyone else."""
	user = user or frappe.session.user
	if is_admin(user):
		return sorted(CAPABILITIES)

	raw = frappe.db.get_value("User", user, CAPABILITY_FIELD)
	if not raw:
		return []
	try:
		stored = json.loads(raw)
	except (ValueError, TypeError):
		return []
	# Drop anything unrecognised so a renamed capability can't silently grant
	# access it no longer maps to.
	return sorted(c for c in stored if c in CAPABILITIES)


def has_capability(capability, user=None):
	return capability in get_capabilities(user)


def check_capability(capability):
	"""Raise unless the current user holds `capability`."""
	if capability not in CAPABILITIES:
		frappe.throw(_("Unknown capability: {0}").format(capability))
	if not has_capability(capability):
		frappe.throw(
			_("You don't have permission to {0}.").format(
				CAPABILITIES[capability]["label"].lower()
			),
			frappe.PermissionError,
		)


@frappe.whitelist()
def list_capabilities():
	"""Catalogue for the admin UI's checkboxes."""
	return [
		{"key": key, "label": meta["label"], "description": meta["description"]}
		for key, meta in CAPABILITIES.items()
	]


@frappe.whitelist()
def my_capabilities():
	"""What the signed-in user may do — drives the frontend navigation."""
	return {
		"capabilities": get_capabilities(),
		"is_admin": is_admin(),
	}


def set_capabilities(user, capabilities):
	"""Replace a user's capability set. Callers must check permission first."""
	capabilities = frappe.parse_json(capabilities) if isinstance(capabilities, str) else capabilities
	unknown = [c for c in capabilities if c not in CAPABILITIES]
	if unknown:
		frappe.throw(_("Unknown capability/capabilities: {0}").format(", ".join(unknown)))
	frappe.db.set_value(
		"User", user, CAPABILITY_FIELD, json.dumps(sorted(set(capabilities))), update_modified=False
	)
	return sorted(set(capabilities))
