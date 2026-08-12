"""Bridges password login to Frappe's token auth for the decoupled Next.js
frontend (PLAN.md section 5, Q17: token-based auth, not session cookies).

Frappe's native token auth (API key/secret pair on the User doctype) is
designed for a fixed, admin-issued server-to-server credential — it has no
built-in "log in with a password and get a token" flow for end users. This
module provides that bridge: authenticate with username/password once
(server-side session, never exposed to the client), mint/rotate that user's
api_key/api_secret, hand the pair back as the frontend's bearer token, and
drop the session immediately. From then on the frontend sends
`Authorization: token <api_key>:<api_secret>` on every request — no cookies
involved.

NOTE: written without a running bench available (see PLAN.md open items /
env_preview_documents_permission.md memory — Docker blocked on macOS Files-
and-Folders permission). Field-level behavior of `User.api_secret` (a
Password-type field, auto-encrypted on save) is based on Frappe framework
knowledge, not verified against a live instance yet — re-test as soon as
Docker access is granted.
"""

import frappe
from frappe import _
from frappe.auth import LoginManager


@frappe.whitelist(allow_guest=True, methods=["POST"])
def login_and_get_token(usr, pwd):
	login_manager = LoginManager()
	login_manager.authenticate(user=usr, pwd=pwd)
	login_manager.post_login()

	user = frappe.session.user
	if user in ("Guest", None):
		frappe.throw(frappe._("Invalid login"), frappe.AuthenticationError)

	user_doc = frappe.get_doc("User", user)

	# Reuse the existing credential rather than minting a fresh one each login.
	# Rotating on every login invalidates every other active session for the
	# same user — logging in on a second device (or a support script hitting the
	# API) silently signs them out elsewhere, which reads as a random
	# "please log in again" with no cause the learner can see.
	api_secret = user_doc.get_password("api_secret", raise_exception=False) if user_doc.api_key else None
	if not user_doc.api_key or not api_secret:
		user_doc.api_key = user_doc.api_key or frappe.generate_hash(length=15)
		api_secret = frappe.generate_hash(length=15)
		user_doc.api_secret = api_secret
		user_doc.save(ignore_permissions=True)

	roles = frappe.get_roles(user)
	from shatam_care.shatam_care.capabilities import get_capabilities, is_admin

	capabilities = get_capabilities(user)
	admin = is_admin(user)

	# Token has been minted — end the cookie session, the frontend only uses
	# the api_key/api_secret bearer token from here on.
	frappe.local.login_manager.logout()

	return {
		"api_key": user_doc.api_key,
		"api_secret": api_secret,
		"user": user,
		"full_name": user_doc.full_name,
		"roles": roles,
		# The frontend gates navigation on these, so send them with the token
		# rather than making every session do a second round-trip.
		"capabilities": capabilities,
		"is_admin": admin,
	}


@frappe.whitelist()
def whoami():
	"""Sanity-check endpoint for the frontend to validate a stored token and
	refresh cached user/role info without re-authenticating."""
	user = frappe.session.user
	from shatam_care.shatam_care.capabilities import get_capabilities, is_admin

	return {
		"user": user,
		"full_name": frappe.db.get_value("User", user, "full_name"),
		"roles": frappe.get_roles(user),
		"capabilities": get_capabilities(user),
		"is_admin": is_admin(user),
	}


@frappe.whitelist()
def change_my_password(current_password, new_password):
	"""Let a signed-in user change their own password.

	Every account is created by an admin with a generated password, so without
	this the learner is stuck with a string they never chose and cannot change.
	Requires the current password: a stolen API token should not be enough to
	take over the account permanently.
	"""
	user = frappe.session.user
	if user in ("Guest", None):
		frappe.throw(_("You must be signed in."), frappe.AuthenticationError)

	# Raises AuthenticationError if the current password is wrong.
	from frappe.utils.password import check_password

	try:
		check_password(user, current_password)
	except frappe.AuthenticationError:
		frappe.throw(_("Your current password is not correct."), frappe.AuthenticationError)

	user_doc = frappe.get_doc("User", user)
	# Frappe's own strength rules apply on save and surface as a clear message.
	user_doc.new_password = new_password
	user_doc.save(ignore_permissions=True)
	return {"user": user}
