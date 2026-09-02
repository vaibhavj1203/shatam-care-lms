"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminCourseRow, createCourse, listAllCourses } from "@/lib/lms-api";

export default function AdminCoursesPage() {
	const [courses, setCourses] = useState<AdminCourseRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [showForm, setShowForm] = useState(false);
	const [title, setTitle] = useState("");
	const [intro, setIntro] = useState("");
	const [saving, setSaving] = useState(false);

	function load() {
		listAllCourses()
			.then(setCourses)
			.catch(() => setError("Could not load courses."));
	}

	useEffect(() => {
		let cancelled = false;
		listAllCourses()
			.then((rows) => {
				if (!cancelled) setCourses(rows);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load courses.");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	async function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			await createCourse(title, intro);
			setTitle("");
			setIntro("");
			setShowForm(false);
			load();
		} finally {
			setSaving(false);
		}
	}

	if (error) return <div className="max-w-4xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	if (!courses) return <div className="max-w-4xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;

	return (
		<div className="max-w-4xl mx-auto px-6 py-10 space-y-5">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-green-900">Courses</h1>
				<button
					onClick={() => setShowForm((v) => !v)}
					className="bg-green-700 text-white rounded px-4 py-2 text-sm"
				>
					{showForm ? "Cancel" : "+ New course"}
				</button>
			</div>

			{showForm && (
				<form
					onSubmit={handleCreate}
					className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2"
				>
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Course title"
						className="w-full border rounded px-3 py-2 text-sm"
						required
					/>
					<textarea
						value={intro}
						onChange={(e) => setIntro(e.target.value)}
						placeholder="Short introduction"
						className="w-full border rounded px-3 py-2 text-sm"
					/>
					<button
						type="submit"
						disabled={saving}
						className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{saving ? "Creating..." : "Create course"}
					</button>
				</form>
			)}

			<div className="space-y-3">
				{courses.length === 0 && <p className="text-gray-500 text-sm">No courses yet.</p>}
				{courses.map((course) => (
					<Link
						key={course.name}
						href={`/admin/courses/${course.name}`}
						className="block bg-white rounded-lg border border-green-100 p-4 hover:shadow-sm"
					>
						<div className="flex items-center justify-between">
							<p className="font-medium text-green-800">{course.title}</p>
							<span
								className={`text-xs px-2 py-0.5 rounded ${
									course.published
										? "bg-green-100 text-green-700"
										: "bg-gray-100 text-gray-600"
								}`}
							>
								{course.published ? "Published" : "Draft"}
							</span>
						</div>
						<p className="text-xs text-gray-500 mt-1">
							{course.lesson_count} lessons &middot; {course.enrollment_count} enrolled
							{!course.has_final_assessment && (
								<span className="text-amber-700"> &middot; no final assessment</span>
							)}
							{!course.evaluator && <span className="text-amber-700"> &middot; no evaluator</span>}
						</p>
					</Link>
				))}
			</div>
		</div>
	);
}
