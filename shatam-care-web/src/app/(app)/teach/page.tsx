"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
	Course,
	LessonSummary,
	getMyCourses,
	getCourseLessonsWithReviewStatus,
	getCourseContent,
	getOrCreateChapter,
	createLesson,
	ChapterSummary,
} from "@/lib/lms-api";

export default function TeachPage() {
	const { user } = useAuth();
	const [courses, setCourses] = useState<Course[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!user) return;
		let cancelled = false;
		getMyCourses(user.user)
			.then((rows) => {
				if (!cancelled) setCourses(rows);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load your courses. Please try again.");
			});
		return () => {
			cancelled = true;
		};
	}, [user]);

	if (error) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	}
	if (!courses) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;
	}

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
			<h1 className="text-2xl font-semibold text-green-900">My Lessons</h1>
			{courses.length === 0 && (
				<p className="text-gray-500 text-sm">
					You aren&apos;t listed as an instructor on any course yet. Ask an admin to add you.
				</p>
			)}
			{courses.map((course) => (
				<CourseLessons key={course.name} course={course} />
			))}
		</div>
	);
}

function CourseLessons({ course }: { course: Course }) {
	const [chapters, setChapters] = useState<ChapterSummary[]>([]);
	const [lessons, setLessons] = useState<LessonSummary[]>([]);
	const [showForm, setShowForm] = useState(false);
	const [chapterTitle, setChapterTitle] = useState("");
	const [lessonTitle, setLessonTitle] = useState("");
	const [youtube, setYoutube] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function fetchCourseData() {
		// getCourseContent covers the instructor case too and returns chapters in
		// authored (reference-table) order; review_status still needs the direct
		// list, which teachers do have permission for.
		return Promise.all([
			getCourseContent(course.name).then((c) => c.chapters),
			getCourseLessonsWithReviewStatus(course.name),
		]);
	}

	useEffect(() => {
		let cancelled = false;
		fetchCourseData()
			.then(([c, l]) => {
				if (cancelled) return;
				setChapters(c);
				setLessons(l);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load lessons for this course.");
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [course.name]);

	async function handleAddLesson(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		try {
			const chapter = await getOrCreateChapter(course.name, chapterTitle);
			await createLesson(course.name, chapter.name, lessonTitle, youtube);
			setChapterTitle("");
			setLessonTitle("");
			setYoutube("");
			setShowForm(false);
			const [c, l] = await fetchCourseData();
			setChapters(c);
			setLessons(l);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="bg-white rounded-lg border border-green-100 p-5 space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-green-800">{course.title}</h2>
				<button
					onClick={() => setShowForm((v) => !v)}
					className="text-sm text-green-700 underline"
				>
					{showForm ? "Cancel" : "+ Add lesson"}
				</button>
			</div>

			{error && <p className="text-sm text-red-600">{error}</p>}

			{showForm && (
				<form onSubmit={handleAddLesson} className="space-y-2 border-t pt-3">
					<input
						list={`chapters-${course.name}`}
						value={chapterTitle}
						onChange={(e) => setChapterTitle(e.target.value)}
						placeholder="Chapter title (existing or new)"
						className="w-full border rounded px-3 py-2 text-sm"
						required
					/>
					<datalist id={`chapters-${course.name}`}>
						{chapters.map((c) => (
							<option key={c.name} value={c.title} />
						))}
					</datalist>
					<input
						value={lessonTitle}
						onChange={(e) => setLessonTitle(e.target.value)}
						placeholder="Lesson title"
						className="w-full border rounded px-3 py-2 text-sm"
						required
					/>
					<input
						value={youtube}
						onChange={(e) => setYoutube(e.target.value)}
						placeholder="YouTube URL or video ID"
						className="w-full border rounded px-3 py-2 text-sm"
						required
					/>
					<button
						type="submit"
						disabled={submitting}
						className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{submitting ? "Creating..." : "Create lesson"}
					</button>
				</form>
			)}

			<ul className="space-y-1">
				{lessons.map((lesson) => (
					<li key={lesson.name} className="flex items-center justify-between text-sm">
						<Link href={`/teach/lessons/${lesson.name}`} className="text-green-700 hover:underline">
							{lesson.title}
						</Link>
						<ReviewBadge status={lesson.review_status} />
					</li>
				))}
			</ul>
		</div>
	);
}

function ReviewBadge({ status }: { status?: string }) {
	const colors: Record<string, string> = {
		Draft: "bg-gray-100 text-gray-600",
		"Submitted for Review": "bg-amber-100 text-amber-700",
		Approved: "bg-green-100 text-green-700",
		Rejected: "bg-red-100 text-red-700",
	};
	return (
		<span className={`text-xs px-2 py-0.5 rounded ${colors[status ?? "Draft"]}`}>
			{status ?? "Draft"}
		</span>
	);
}
