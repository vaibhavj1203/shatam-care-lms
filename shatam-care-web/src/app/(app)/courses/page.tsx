"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPublishedCourses, Course } from "@/lib/lms-api";

export default function CoursesPage() {
	const [courses, setCourses] = useState<Course[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		listPublishedCourses()
			.then(setCourses)
			.catch(() => setError("Could not load courses. Please try again."));
	}, []);

	return (
		<div className="max-w-3xl mx-auto px-6 py-10">
			<h1 className="text-2xl font-semibold text-green-900 mb-6">Courses</h1>

			{error && <p className="text-red-600">{error}</p>}
			{!error && !courses && <p className="text-gray-500">Loading...</p>}
			{courses?.length === 0 && <p className="text-gray-500">No courses available yet.</p>}

			<div className="grid gap-4 sm:grid-cols-2">
				{courses?.map((course) => (
					<Link
						key={course.name}
						href={`/courses/${course.name}`}
						className="block rounded-lg border border-green-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
					>
						<h2 className="font-semibold text-green-800">{course.title}</h2>
						{course.short_introduction && (
							<p className="text-sm text-gray-500 mt-1">{course.short_introduction}</p>
						)}
					</Link>
				))}
			</div>
		</div>
	);
}
