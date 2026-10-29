// Domain-specific helpers on top of frappe-client.ts, scoped to what the
// student/teacher/admin/evaluator flows need (PLAN.md sections 3.1-3.8).
import { Capability, callMethod, createDoc, fetchBlob, getDoc, getList, uploadPublicFile } from "./frappe-client";

export type { Capability };

export type Course = {
	name: string;
	title: string;
	short_introduction?: string;
	image?: string;
	enrolled?: boolean;
};

export type LessonSummary = {
	name: string;
	title: string;
	chapter: string;
	youtube: string;
	idx: number;
	review_status?: ReviewStatus;
};

export type ReviewStatus = "Draft" | "Submitted for Review" | "Approved" | "Rejected";

export type ChapterSummary = {
	name: string;
	title: string;
	idx: number;
};

export type Enrollment = {
	name: string;
	member: string;
	course: string;
	progress: number;
	preferred_language?: string;
	student_group?: string;
};

export type Checkpoint = {
	name: string;
	timestamp_seconds: number;
	label: string;
	question_text: string;
	order: number;
	already_attempted: boolean;
	options?: { option_text: string }[];
};

// Students have no read permission on LMS Course (stock lms grants it only to
// System Manager / Course Creator / Moderator), so /api/resource 403s for them.
export function listPublishedCourses(): Promise<Course[]> {
	return callMethod<Course[]>("shatam_care.shatam_care.content.list_published_courses");
}

// Students have NO read permission on Course Lesson (stock lms grants it only
// to System Manager / Course Creator / Moderator), so listing it over
// /api/resource/* 403s for them. This whitelisted method verifies enrollment
// and reads with elevated permissions, and orders by the Chapter/Lesson
// Reference tables — the authored order stock lms treats as canonical.
export function getCourseContent(
	courseId: string,
): Promise<{
	title: string;
	short_introduction?: string;
	chapters: ChapterSummary[];
	lessons: LessonSummary[];
	/** False for a published course the learner hasn't joined — show a preview
	 *  with an Enrol button rather than an error. */
	enrolled: boolean;
}> {
	return callMethod("shatam_care.shatam_care.content.get_course_content", {
		course: courseId,
	});
}

export function getMyEnrollment(courseId: string, member: string): Promise<Enrollment[]> {
	return getList<Enrollment>("LMS Enrollment", {
		filters: [
			["course", "=", courseId],
			["member", "=", member],
		],
		fields: ["name", "member", "course", "progress", "preferred_language", "student_group"],
	});
}

export function enroll(courseId: string, member: string): Promise<Enrollment> {
	return createDoc<Enrollment>("LMS Enrollment", {
		course: courseId,
		member,
		member_type: "Student",
	});
}

export function getLessonCheckpoints(lessonId: string): Promise<Checkpoint[]> {
	return callMethod<Checkpoint[]>(
		"shatam_care.shatam_care.api.get_lesson_checkpoints",
		{ lesson: lessonId },
	);
}

// Submits the option's position, not its text — see the backend docstring:
// translated option text would never match the stored originals.
export function submitCheckpointAttempt(
	checkpointId: string,
	selectedIndex: number,
): Promise<{ is_correct: boolean }> {
	return callMethod("shatam_care.shatam_care.api.submit_checkpoint_attempt", {
		checkpoint: checkpointId,
		selected_index: selectedIndex,
	});
}

// Delegates to stock lms's whitelisted save_progress rather than writing
// `LMS Course Progress` directly. Two reasons, both found by running against a
// real backend: the LMS Student role has no create permission on that doctype
// (direct insert 403s), and save_progress additionally sets
// `LMS Enrollment.current_lesson`, recalculates course progress, and handles
// concurrent writes — all of which a raw insert skips.
export function markLessonComplete(courseId: string, lessonId: string) {
	return callMethod<number | Record<string, unknown>>(
		"lms.lms.doctype.course_lesson.course_lesson.save_progress",
		{ lesson: lessonId, course: courseId },
	);
}

export type EligibilityStatus =
	| "Not Started"
	| "Pending Auto-Gate"
	| "Eligible - Pending Approval"
	| "Approved"
	| "Rejected";

export type CertificateEligibility = {
	status: EligibilityStatus;
	all_lessons_completed?: boolean;
	all_checkpoints_passed?: boolean;
	certificate?: string;
	rejection_reason?: string;
};

export function getCertificateEligibility(courseId: string): Promise<CertificateEligibility> {
	return callMethod<CertificateEligibility>(
		"shatam_care.shatam_care.api.get_certificate_eligibility",
		{ course: courseId },
	);
}

export function getCertificate(name: string) {
	return getDoc<{ name: string; certificate_uid: string; verification_url: string }>(
		"LMS Certificate",
		name,
	);
}

// --- Teacher authoring (PLAN.md 3.6 / SCHEMA.md content_review.py) ---

// Courses the signed-in user may author. Admins and anyone with "content"
// get all of them; everyone else only those they instruct. Replaces the old
// client-side instructor filter, which showed admins an empty list.
export function getAuthorableCourses(): Promise<Course[]> {
	return callMethod<Course[]>("shatam_care.shatam_care.content.courses_i_can_author");
}

export type LearnerState = { enrolments: number; certificates: number; is_learner: boolean };

// Whether to show the learner UI. Not simply the LMS Student role: Frappe's
// built-in Administrator holds every role, so that alone gave it a learner
// dashboard it had no use for. See the backend docstring.
export function getMyLearnerState(): Promise<LearnerState> {
	return callMethod<LearnerState>("shatam_care.shatam_care.api.my_learner_state");
}

export function changeMyPassword(currentPassword: string, newPassword: string) {
	return callMethod<{ user: string }>("shatam_care.shatam_care.auth.change_my_password", {
		current_password: currentPassword,
		new_password: newPassword,
	});
}

export async function getMyCourses(user: string): Promise<Course[]> {
	const rows = await getList<{ parent: string }>("Course Instructor", {
		filters: [["instructor", "=", user]],
		fields: ["parent"],
	});
	const courseIds = [...new Set(rows.map((r) => r.parent))];
	if (!courseIds.length) return [];
	return getList<Course>("LMS Course", {
		filters: [["name", "in", courseIds]],
		fields: ["name", "title", "short_introduction", "image"],
	});
}

// Routed through a capability-gated backend method, not a direct Course Lesson
// read: stock lms gives the Course Creator role only if_owner read, so a
// coordinator with the "content" capability 403'd on lessons others authored.
export function getCourseLessonsWithReviewStatus(courseId: string): Promise<LessonSummary[]> {
	return callMethod<LessonSummary[]>(
		"shatam_care.shatam_care.content.get_course_lessons_for_teacher",
		{ course: courseId },
	);
}

// Creating chapters/lessons must also write the Chapter Reference /
// Lesson Reference child rows, or the content is invisible to every stock lms
// feature that walks a course (outline, next/prev lesson, progress). No
// controller backfills them, so these go through server-side helpers.
export function getOrCreateChapter(courseId: string, title: string): Promise<ChapterSummary> {
	return callMethod<ChapterSummary>("shatam_care.shatam_care.content.get_or_create_chapter", {
		course: courseId,
		title,
	});
}

export function createLesson(
	courseId: string,
	chapterId: string,
	title: string,
	youtube: string,
): Promise<LessonSummary> {
	return callMethod<LessonSummary>("shatam_care.shatam_care.content.create_lesson", {
		course: courseId,
		chapter: chapterId,
		title,
		youtube,
	});
}

export function getLessonForStudent(lessonId: string) {
	return callMethod<{
		name: string;
		title: string;
		course: string;
		chapter: string;
		youtube: string;
	}>("shatam_care.shatam_care.content.get_lesson_for_student", { lesson: lessonId });
}

export function getLessonForTeacher(lessonId: string) {
	// Capability-gated backend method rather than a direct Course Lesson read,
	// for the same if_owner reason as getCourseLessonsWithReviewStatus.
	return callMethod<{
		name: string;
		title: string;
		course: string;
		chapter: string;
		youtube: string;
		review_status: ReviewStatus;
	}>("shatam_care.shatam_care.content.get_lesson_for_teacher", { lesson: lessonId });
}

// Capability-gated backend method, not a direct LMS Video Checkpoint read: a
// content-capable coordinator isn't a System Manager, so the doctype's role
// permissions 403'd the direct list.
export function getAllLessonCheckpoints(lessonId: string) {
	return callMethod<{
		name: string;
		timestamp_seconds: number;
		label: string;
		question_text: string;
		order: number;
	}[]>("shatam_care.shatam_care.api.list_lesson_checkpoints", { lesson: lessonId });
}

export function createCheckpoint(
	lessonId: string,
	timestampSeconds: number,
	label: string,
	questionText: string,
	options: { option_text: string; is_correct: boolean }[],
) {
	// Capability-gated backend method, not a direct create, for the same reason
	// as getAllLessonCheckpoints.
	return callMethod<{ name: string }>("shatam_care.shatam_care.api.create_checkpoint", {
		lesson: lessonId,
		timestamp_seconds: Math.round(timestampSeconds),
		label,
		question_text: questionText,
		options: JSON.stringify(options),
	});
}

export function submitLessonForReview(lessonId: string): Promise<ReviewStatus> {
	return callMethod<ReviewStatus>("shatam_care.shatam_care.api.submit_lesson_for_review", {
		lesson: lessonId,
	});
}

// --- Admin content review (PLAN.md section 3.6) ---

export function getPendingLessonReviews() {
	return callMethod<
		{ name: string; title: string; course: string; submitted_on: string }[]
	>("shatam_care.shatam_care.api.pending_lesson_reviews");
}

export function reviewLesson(
	lessonId: string,
	decision: "Approved" | "Rejected",
	notes?: string,
): Promise<ReviewStatus> {
	return callMethod<ReviewStatus>("shatam_care.shatam_care.api.review_lesson", {
		lesson: lessonId,
		decision,
		notes,
	});
}

// --- Evaluator certificate approvals (PLAN.md section 3.5) ---

export type EligibilityQueueRow = {
	name: string;
	member: string;
	course: string;
	auto_gated_on: string;
};

export function getEvaluatorQueue() {
	return callMethod<EligibilityQueueRow[]>("shatam_care.shatam_care.api.evaluator_queue");
}

export function approveCertificate(eligibilityName: string) {
	return callMethod("shatam_care.shatam_care.certificate_eligibility.approve_certificate", {
		eligibility_name: eligibilityName,
	});
}

export function rejectCertificate(eligibilityName: string, reason: string) {
	return callMethod("shatam_care.shatam_care.certificate_eligibility.reject_certificate", {
		eligibility_name: eligibilityName,
		reason,
	});
}

// --- Final assessment (PLAN.md 3.4) ---
// Delivery/scoring is stock lms (get_quiz_with_questions / submit_quiz); our
// wrapper adds the course lookup, language overlay and attempt limit.

export type AssessmentQuestion = {
	name: string;
	question: string;
	type: string;
	multiple: number;
	option_1?: string;
	option_2?: string;
	option_3?: string;
	option_4?: string;
};

export type AssessmentAttempt = {
	name: string;
	score: number;
	score_out_of: number;
	percentage: number;
	passing_percentage: number;
	creation: string;
	passed: boolean;
};

export type FinalAssessment =
	| { exists: false }
	| {
			exists: true;
			quiz: {
				name: string;
				title: string;
				passing_percentage: number;
				total_marks: number;
				max_attempts: number;
				duration: number;
				questions: { question: string; marks: number }[];
			};
			questions_by_name: Record<string, AssessmentQuestion>;
			attempts: AssessmentAttempt[];
			has_passed: boolean;
			attempts_used: number;
	  };

export function getFinalAssessment(course: string): Promise<FinalAssessment> {
	return callMethod<FinalAssessment>("shatam_care.shatam_care.assessment.get_final_assessment", {
		course,
	});
}

export function submitFinalAssessment(
	course: string,
	results: { question_name: string; answer: string[] }[],
) {
	return callMethod<{
		score: number;
		score_out_of: number;
		percentage: number;
		pass: boolean;
		submission: string;
	}>("shatam_care.shatam_care.assessment.submit_final_assessment", {
		course,
		results: JSON.stringify(results),
	});
}

export function setLanguagePreference(course: string, language: string) {
	return callMethod<string>("shatam_care.shatam_care.assessment.set_language_preference", {
		course,
		language,
	});
}

export function getAvailableLanguages() {
	return callMethod<{ name: string; language_name: string }[]>(
		"shatam_care.shatam_care.assessment.get_available_languages",
	);
}

// --- Certificates (learner) ---

export type MyCertificate = {
	name: string;
	course: string;
	course_title: string;
	issue_date: string;
	certificate_uid: string;
	verification_url: string;
};

export function getMyCertificates() {
	return callMethod<MyCertificate[]>("shatam_care.shatam_care.api.my_certificates");
}

// --- Checkpoint authoring (teacher) ---

export type CheckpointDetail = {
	name: string;
	label: string;
	timestamp_seconds: number;
	question_text: string;
	options: { option_text: string; is_correct: number }[];
	translations: {
		name: string;
		language: string;
		question_text: string;
		options: { option_text: string }[];
	}[];
};

export function getCheckpointDetail(checkpoint: string) {
	return callMethod<CheckpointDetail>("shatam_care.shatam_care.api.get_checkpoint_detail", {
		checkpoint,
	});
}

export function updateCheckpoint(
	checkpoint: string,
	data: {
		question_text?: string;
		label?: string;
		timestamp_seconds?: number;
		options?: { option_text: string; is_correct: boolean }[];
	},
) {
	return callMethod<string>("shatam_care.shatam_care.api.update_checkpoint", {
		checkpoint,
		...data,
		options: data.options ? JSON.stringify(data.options) : undefined,
	});
}

export function deleteCheckpoint(checkpoint: string) {
	return callMethod<string>("shatam_care.shatam_care.api.delete_checkpoint", { checkpoint });
}

export function saveCheckpointTranslation(
	checkpoint: string,
	language: string,
	questionText: string,
	options: string[],
) {
	return callMethod<string>("shatam_care.shatam_care.api.save_checkpoint_translation", {
		checkpoint,
		language,
		question_text: questionText,
		options: JSON.stringify(options),
	});
}

// --- Admin management (admin_api.py) ---

export type AdminCourseRow = {
	name: string;
	title: string;
	short_introduction?: string;
	published: number;
	evaluator?: string;
	lesson_count: number;
	enrollment_count: number;
	has_final_assessment: boolean;
};

export function listAllCourses() {
	return callMethod<AdminCourseRow[]>("shatam_care.shatam_care.admin_api.list_all_courses");
}

export function createCourse(title: string, shortIntroduction?: string) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.create_course", {
		title,
		short_introduction: shortIntroduction,
	});
}

export function updateAssessment(quiz: string, passingPercentage: number) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.update_assessment", {
		quiz,
		passing_percentage: passingPercentage,
	});
}

export function updateCourseAdmin(
	course: string,
	data: { title?: string; short_introduction?: string; published?: number },
) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.update_course", {
		course,
		...data,
	});
}

export type CourseAdminDetail = {
	name: string;
	title: string;
	short_introduction?: string;
	published: number;
	instructors: { name: string; full_name: string }[];
	evaluator?: string;
	evaluator_user?: string;
	/** Everyone who may sign off this course. Admins are always included and
	 *  cannot be removed. */
	evaluators: { name: string; full_name: string }[];
	final_assessment?: { name: string; title: string };
	lesson_count: number;
};

export function getCourseAdminDetail(course: string) {
	return callMethod<CourseAdminDetail>(
		"shatam_care.shatam_care.admin_api.get_course_admin_detail",
		{ course },
	);
}

export function addInstructor(course: string, user: string) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.add_instructor", { course, user });
}

export function removeInstructor(course: string, user: string) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.remove_instructor", {
		course,
		user,
	});
}

export function addCourseEvaluator(course: string, user: string) {
	return callMethod<{ name: string; full_name: string }[]>(
		"shatam_care.shatam_care.admin_api.add_course_evaluator",
		{ course, user },
	);
}

export function removeCourseEvaluator(course: string, user: string) {
	return callMethod<{ name: string; full_name: string }[]>(
		"shatam_care.shatam_care.admin_api.remove_course_evaluator",
		{ course, user },
	);
}

export function setCourseEvaluator(course: string, user: string) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.set_course_evaluator", {
		course,
		user,
	});
}

export function createFinalAssessment(course: string, title: string, passingPercentage: number) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.create_final_assessment", {
		course,
		title,
		passing_percentage: passingPercentage,
	});
}

export function addAssessmentQuestion(
	quiz: string,
	questionText: string,
	options: string[],
	correctIndexes: number[],
	marks = 1,
) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.add_assessment_question", {
		quiz,
		question_text: questionText,
		options: JSON.stringify(options),
		correct_indexes: JSON.stringify(correctIndexes),
		marks,
	});
}

export function getAssessmentQuestions(quiz: string) {
	return callMethod<AssessmentQuestion[]>(
		"shatam_care.shatam_care.admin_api.get_assessment_questions",
		{ quiz },
	);
}

export function removeAssessmentQuestion(quiz: string, question: string) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.remove_assessment_question", {
		quiz,
		question,
	});
}

export type StudentRow = {
	name: string;
	member: string;
	member_name: string;
	course: string;
	progress: number;
	student_group?: string;
	preferred_language?: string;
};

export function listStudents(course?: string, studentGroup?: string) {
	return callMethod<StudentRow[]>("shatam_care.shatam_care.admin_api.list_students", {
		course,
		student_group: studentGroup,
	});
}

export type AppRole = "LMS Student" | "Course Creator" | "Batch Evaluator" | "Moderator";

// Creates an account with an explicit role set. Distinct from createStudent,
// which always grants "LMS Student" — using that for staff gives a teacher or
// evaluator the learner navigation (catalogue, enrolment, certificates) on top
// of their own, which is confusing and wrong.
export function createUser(
	email: string,
	fullName: string,
	roles: AppRole[],
	capabilities: Capability[] = [],
	mobileNo?: string,
	password?: string,
) {
	return callMethod<{ user: string; password: string | null; existed: boolean }>(
		"shatam_care.shatam_care.admin_api.create_user",
		{
			email,
			full_name: fullName,
			roles: JSON.stringify(roles),
			capabilities: JSON.stringify(capabilities),
			mobile_no: mobileNo,
			password,
		},
	);
}

export type CapabilityInfo = { key: Capability; label: string; description: string };

export function listCapabilities() {
	return callMethod<CapabilityInfo[]>("shatam_care.shatam_care.capabilities.list_capabilities");
}

export type Person = {
	user: string;
	full_name: string;
	enabled: boolean;
	roles: AppRole[];
	capabilities: Capability[];
};

export function listPeople(search?: string) {
	return callMethod<Person[]>("shatam_care.shatam_care.admin_api.list_people", { search });
}

export function updatePerson(user: string, roles?: AppRole[], capabilities?: Capability[]) {
	return callMethod<{ user: string; roles?: AppRole[]; capabilities?: Capability[] }>(
		"shatam_care.shatam_care.admin_api.update_person",
		{
			user,
			roles: roles ? JSON.stringify(roles) : undefined,
			capabilities: capabilities ? JSON.stringify(capabilities) : undefined,
		},
	);
}

export function setUserRoles(user: string, roles: AppRole[]) {
	return callMethod<AppRole[]>("shatam_care.shatam_care.admin_api.set_user_roles", {
		user,
		roles: JSON.stringify(roles),
	});
}

export function resetUserPassword(user: string, password?: string) {
	return callMethod<{ user: string; password: string }>(
		"shatam_care.shatam_care.admin_api.reset_password",
		{ user, password },
	);
}

export function createStudent(
	email: string,
	fullName: string,
	mobileNo?: string,
	password?: string,
) {
	return callMethod<{ user: string; password: string | null; existed: boolean }>(
		"shatam_care.shatam_care.admin_api.create_student",
		{ email, full_name: fullName, mobile_no: mobileNo, password },
	);
}

export function enrollStudent(
	course: string,
	member: string,
	studentGroup?: string,
	preferredLanguage?: string,
) {
	return callMethod<string>("shatam_care.shatam_care.admin_api.enroll_student", {
		course,
		member,
		student_group: studentGroup,
		preferred_language: preferredLanguage,
	});
}

export function searchUsers(query: string) {
	return callMethod<{ name: string; full_name: string }[]>(
		"shatam_care.shatam_care.admin_api.search_users",
		{ query },
	);
}

// --- Student groups (plain REST — admin-only doctype) ---

export type StudentGroup = {
	name: string;
	title: string;
	region?: string;
	coordinator?: string;
	description?: string;
};

// Via the capability gate, not /api/resource: the doctype grants read to
// System Manager / Moderator only, so a delegated coordinator holding "people"
// would be blocked by doctype permissions they don't hold.
export function listStudentGroups() {
	return callMethod<StudentGroup[]>("shatam_care.shatam_care.admin_api.list_student_groups");
}

export function createStudentGroup(data: {
	title: string;
	region?: string;
	coordinator?: string;
	description?: string;
}) {
	return callMethod<StudentGroup>(
		"shatam_care.shatam_care.admin_api.create_student_group",
		data as unknown as Record<string, unknown>,
	);
}

// --- Certificate template (admin_api.py) ---

// The one Print Format every certificate renders with. What an admin changes is
// the background image and text it reads, not which format is used, so students
// download with this name no matter when their certificate was issued.
export const CERTIFICATE_PRINT_FORMAT = "Shatam Certificate";

export type CertificateSettings = {
	/** URL of the uploaded background, or "" when the built-in design is used. */
	background_url: string;
	using_default: boolean;
	default_background_url: string;
	certificate_title: string;
	signatory_name: string;
	signatory_title: string;
	requirements: { width_px: number; height_px: number; min_width_px: number; max_mb: number };
};

export function getCertificateSettings() {
	return callMethod<CertificateSettings>("shatam_care.shatam_care.admin_api.get_certificate_settings");
}

// Two steps so the server can check the image before it goes live: upload the
// file, then ask for it to be applied (the server deletes it if it is unsuitable).
export async function uploadCertificateBackground(file: File) {
	const fileUrl = await uploadPublicFile(file);
	return callMethod<CertificateSettings>("shatam_care.shatam_care.admin_api.set_certificate_background", {
		file_url: fileUrl,
	});
}

export function resetCertificateBackground() {
	return callMethod<CertificateSettings>("shatam_care.shatam_care.admin_api.reset_certificate_background", {});
}

export function updateCertificateText(data: {
	certificate_title: string;
	signatory_name: string;
	signatory_title: string;
}) {
	return callMethod<CertificateSettings>(
		"shatam_care.shatam_care.admin_api.update_certificate_text",
		data as unknown as Record<string, unknown>,
	);
}

export function fetchCertificatePreview() {
	return fetchBlob("/api/method/shatam_care.shatam_care.admin_api.preview_certificate");
}
