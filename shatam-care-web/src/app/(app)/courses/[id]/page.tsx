"use client";

import { decodeParam } from "@/lib/route-params";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { FRAPPE_URL } from "@/lib/frappe-client";
import {
	ChapterSummary,
	LessonSummary,
	Enrollment,
	CertificateEligibility,
	FinalAssessment,
	getCourseContent,
	getMyEnrollment,
	getCertificateEligibility,
	getCertificate,
	getFinalAssessment,
	getAvailableLanguages,
	setLanguagePreference,
	enroll,
} from "@/lib/lms-api";

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id: rawCourseId } = use(params);
	const courseId = decodeParam(rawCourseId);
	const { user } = useAuth();
	const [courseTitle, setCourseTitle] = useState<string>("");
	const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
	const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
	const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
	const [enrolling, setEnrolling] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!user) return;
		let cancelled = false;
		Promise.all([getCourseContent(courseId), getMyEnrollment(courseId, user.user)])
			.then(([content, enrollmentRows]) => {
				if (cancelled) return;
				setCourseTitle(content.title);
				setChapters(content.chapters);
				setLessons(content.lessons);
				setEnrollment(enrollmentRows[0] ?? null);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load this course. Please try again.");
			});
		return () => {
			cancelled = true;
		};
	}, [courseId, user]);

	async function handleEnroll() {
		if (!user) return;
		setEnrolling(true);
		try {
			const record = await enroll(courseId, user.user);
			setEnrollment(record);
		} finally {
			setEnrolling(false);
		}
	}

	if (error) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	}
	if (!chapters || !lessons) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;
	}

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-green-900">{courseTitle}</h1>
				{!enrollment && (
					<button
						onClick={handleEnroll}
						disabled={enrolling}
						className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{enrolling ? "Enrolling..." : "Enroll"}
					</button>
				)}
			</div>

			{!enrollment && (
				<p className="text-sm text-gray-500">
					Enroll to start watching lessons and take the final assessment.
				</p>
			)}

			<div className="space-y-4">
				{chapters.map((chapter) => (
					<div key={chapter.name} className="bg-white rounded-lg border border-green-100 p-4">
						<h2 className="font-semibold text-green-800 mb-2">{chapter.title}</h2>
						<ul className="space-y-1">
							{lessons
								.filter((lesson) => lesson.chapter === chapter.name)
								.map((lesson) =>
									enrollment ? (
										<li key={lesson.name}>
											<Link
												href={`/courses/${courseId}/lessons/${lesson.name}`}
												className="text-green-700 hover:underline text-sm"
											>
												{lesson.title}
											</Link>
										</li>
									) : (
										<li key={lesson.name} className="text-sm text-gray-400">
											{lesson.title}
										</li>
									),
								)}
						</ul>
					</div>
				))}
			</div>

			{enrollment && (
				<>
					<LanguagePreference courseId={courseId} current={enrollment.preferred_language} />
					<FinalAssessmentCard courseId={courseId} />
					<CertificateStatus courseId={courseId} />
				</>
			)}
		</div>
	);
}

function LanguagePreference({ courseId, current }: { courseId: string; current?: string }) {
	const [languages, setLanguages] = useState<{ name: string; language_name: string }[]>([]);
	const [selected, setSelected] = useState(current ?? "");
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		let cancelled = false;
		getAvailableLanguages()
			.then((rows) => {
				if (!cancelled) setLanguages(rows);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	async function handleChange(value: string) {
		setSelected(value);
		setSaved(false);
		if (!value) return;
		await setLanguagePreference(courseId, value);
		setSaved(true);
	}

	if (!languages.length) return null;

	return (
		<div className="bg-white rounded-lg border border-green-100 p-4">
			<h2 className="font-semibold text-green-800 mb-1">Language</h2>
			<p className="text-xs text-gray-500 mb-2">
				Sets the language for quiz questions and your certificate. For the video itself, tap the
				settings (gear) icon in the player and choose your audio language.
			</p>
			<div className="flex items-center gap-3">
				<select
					value={selected}
					onChange={(e) => handleChange(e.target.value)}
					className="border rounded px-3 py-2 text-sm"
				>
					<option value="">Default (English)</option>
					{languages.map((language) => (
						<option key={language.name} value={language.name}>
							{language.language_name}
						</option>
					))}
				</select>
				{saved && <span className="text-xs text-green-700">Saved</span>}
			</div>
		</div>
	);
}

function FinalAssessmentCard({ courseId }: { courseId: string }) {
	const [assessment, setAssessment] = useState<FinalAssessment | null>(null);

	useEffect(() => {
		let cancelled = false;
		getFinalAssessment(courseId)
			.then((data) => {
				if (!cancelled) setAssessment(data);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [courseId]);

	if (!assessment || !assessment.exists) return null;

	return (
		<div className="bg-white rounded-lg border border-green-100 p-4">
			<h2 className="font-semibold text-green-800 mb-1">Final Assessment</h2>
			{assessment.has_passed ? (
				<p className="text-sm text-green-700">
					Passed &mdash; {assessment.attempts.find((a) => a.passed)?.percentage}%
				</p>
			) : (
				<>
					<p className="text-sm text-gray-500 mb-2">
						{assessment.quiz.questions.length} questions &middot; pass mark{" "}
						{assessment.quiz.passing_percentage}%. Complete all lessons first.
					</p>
					<Link
						href={`/courses/${courseId}/assessment`}
						className="inline-block bg-green-700 text-white rounded px-4 py-2 text-sm"
					>
						{assessment.attempts_used > 0 ? "Retake assessment" : "Take assessment"}
					</Link>
				</>
			)}
		</div>
	);
}

function CertificateStatus({ courseId }: { courseId: string }) {
	const [eligibility, setEligibility] = useState<CertificateEligibility | null>(null);
	const [certificateUid, setCertificateUid] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getCertificateEligibility(courseId)
			.then((data) => {
				if (cancelled) return;
				setEligibility(data);
				if (data.status === "Approved" && data.certificate) {
					getCertificate(data.certificate)
						.then((cert) => {
							if (!cancelled) setCertificateUid(cert.certificate_uid);
						})
						.catch(() => {});
				}
			})
			.catch(() => {
				// Non-critical section — if it fails to load, just don't show it
				// rather than surfacing an error for a secondary widget.
			});
		return () => {
			cancelled = true;
		};
	}, [courseId]);

	if (!eligibility || eligibility.status === "Not Started") return null;

	return (
		<div className="bg-white rounded-lg border border-green-100 p-4">
			<h2 className="font-semibold text-green-800 mb-1">Certificate</h2>
			{eligibility.status === "Pending Auto-Gate" && (
				<p className="text-sm text-gray-500">
					Complete all lessons, in-video checkpoints, and the final assessment to become
					eligible for your certificate.
				</p>
			)}
			{eligibility.status === "Eligible - Pending Approval" && (
				<p className="text-sm text-amber-700">
					You&apos;ve completed everything — your certificate is awaiting evaluator approval.
				</p>
			)}
			{eligibility.status === "Rejected" && (
				<p className="text-sm text-red-600">
					Your certificate request was not approved
					{eligibility.rejection_reason ? `: ${eligibility.rejection_reason}` : "."}
				</p>
			)}
			{eligibility.status === "Approved" && certificateUid && (
				<div className="text-sm text-green-700 space-y-1">
					<p>Congratulations — your certificate has been issued!</p>
					<a
						href={`${FRAPPE_URL}/verify?id=${certificateUid}`}
						target="_blank"
						rel="noopener noreferrer"
						className="underline"
					>
						View certificate ({certificateUid})
					</a>
				</div>
			)}
		</div>
	);
}
