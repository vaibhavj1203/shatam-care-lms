// Maps our four personas (PLAN.md section 2) onto Frappe roles that already
// exist in the stock lms app (see lms/install.py) — no new roles invented.
export const ROLES = {
	ADMIN: "Moderator",
	TEACHER: "Course Creator",
	EVALUATOR: "Batch Evaluator",
	STUDENT: "LMS Student",
} as const;
