from . import __version__ as app_version

app_name = "shatam_care"
app_title = "Shatam Care"
app_publisher = "Shatam Care Foundation"
app_description = "Shatam Care Foundation LMS customizations on top of Frappe Learning"
app_icon_url = "/assets/shatam_care/images/shatam-care-logo.png"
app_color = "green"
app_email = "admin@shatamcare.org"
app_license = "AGPL"
required_apps = ["lms"]

after_install = "shatam_care.shatam_care.install.after_install"

fixtures = [
	{"dt": "Custom Field", "filters": [["module", "=", "Shatam Care"]]},
	{"dt": "Property Setter", "filters": [["module", "=", "Shatam Care"]]},
]

doc_events = {
	# Neither doctype is submittable (docstatus workflow) in stock lms — both
	# are just saved as plain Documents, so we hook insert/update rather than
	# on_submit/on_cancel.
	"LMS Quiz Submission": {
		"after_insert": "shatam_care.shatam_care.certificate_eligibility.on_quiz_submission",
	},
	"LMS Course Progress": {
		"on_update": "shatam_care.shatam_care.certificate_eligibility.on_progress_update",
	},
	"Course Lesson": {
		"validate": "shatam_care.shatam_care.content_review.validate_lesson_review_status",
	},
}

permission_query_conditions = {
	"LMS Certificate Eligibility": "shatam_care.shatam_care.permissions.certificate_eligibility_query_conditions",
}

# www/verify/index.html -> served at /verify (Frappe's folder-name-is-route convention)
