"use client";

import { useEffect, useState } from "react";
import {
	AdminCourseRow,
	StudentGroup,
	StudentRow,
	createStudent,
	enrollStudent,
	listAllCourses,
	listStudentGroups,
	listStudents,
} from "@/lib/lms-api";

export default function AdminStudentsPage() {
	const [students, setStudents] = useState<StudentRow[] | null>(null);
	const [courses, setCourses] = useState<AdminCourseRow[]>([]);
	const [groups, setGroups] = useState<StudentGroup[]>([]);
	const [courseFilter, setCourseFilter] = useState("");
	const [error, setError] = useState<string | null>(null);

	async function loadStudents(course?: string) {
		setStudents(await listStudents(course || undefined));
	}

	useEffect(() => {
		let cancelled = false;
		Promise.all([listStudents(), listAllCourses(), listStudentGroups()])
			.then(([studentRows, courseRows, groupRows]) => {
				if (cancelled) return;
				setStudents(studentRows);
				setCourses(courseRows);
				setGroups(groupRows);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load students.");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (error) return <div className="max-w-4xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	if (!students) return <div className="max-w-4xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;

	return (
		<div className="max-w-4xl mx-auto px-6 py-10 space-y-5">
			<h1 className="text-2xl font-semibold text-green-900">Students</h1>

			<RegisterStudentForm
				courses={courses}
				groups={groups}
				onDone={() => loadStudents(courseFilter)}
			/>

			<div className="flex items-center gap-2">
				<label className="text-sm text-gray-600">Filter by course:</label>
				<select
					value={courseFilter}
					onChange={(e) => {
						setCourseFilter(e.target.value);
						loadStudents(e.target.value);
					}}
					className="border rounded px-3 py-1.5 text-sm"
				>
					<option value="">All courses</option>
					{courses.map((course) => (
						<option key={course.name} value={course.name}>
							{course.title}
						</option>
					))}
				</select>
			</div>

			<div className="bg-white rounded-lg border border-green-100 overflow-hidden">
				<table className="w-full text-sm">
					<thead className="bg-green-50 text-green-800">
						<tr>
							<th className="text-left px-4 py-2">Student</th>
							<th className="text-left px-4 py-2">Course</th>
							<th className="text-left px-4 py-2">Progress</th>
							<th className="text-left px-4 py-2">Group</th>
							<th className="text-left px-4 py-2">Language</th>
						</tr>
					</thead>
					<tbody>
						{students.length === 0 && (
							<tr>
								<td colSpan={5} className="px-4 py-6 text-center text-gray-500">
									No enrollments found.
								</td>
							</tr>
						)}
						{students.map((row) => (
							<tr key={row.name} className="border-t">
								<td className="px-4 py-2">
									{row.member_name}
									<span className="text-gray-400 text-xs block">{row.member}</span>
								</td>
								<td className="px-4 py-2">{row.course}</td>
								<td className="px-4 py-2">{Math.round(row.progress ?? 0)}%</td>
								<td className="px-4 py-2">{row.student_group ?? "—"}</td>
								<td className="px-4 py-2">{row.preferred_language ?? "Default"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function RegisterStudentForm({
	courses,
	groups,
	onDone,
}: {
	courses: AdminCourseRow[];
	groups: StudentGroup[];
	onDone: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [fullName, setFullName] = useState("");
	const [mobile, setMobile] = useState("");
	const [course, setCourse] = useState("");
	const [group, setGroup] = useState("");
	const [saving, setSaving] = useState(false);
	const [result, setResult] = useState<{ user: string; password: string | null } | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			const created = await createStudent(email, fullName, mobile || undefined);
			if (course) {
				await enrollStudent(course, created.user, group || undefined);
			}
			setResult({ user: created.user, password: created.password });
			setEmail("");
			setFullName("");
			setMobile("");
			onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not register the student.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="bg-white rounded-lg border border-green-100 p-4 space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-green-800">Register a student</h2>
				<button onClick={() => setOpen((v) => !v)} className="text-sm text-green-700 underline">
					{open ? "Cancel" : "+ New student"}
				</button>
			</div>
			<p className="text-xs text-gray-500">
				For learners who can&apos;t sign up themselves — creates their account and optionally
				enrolls them in a course.
			</p>

			{result && (
				<div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
					<p className="font-medium text-green-800">Registered {result.user}</p>
					{result.password && (
						<p className="text-gray-700 mt-1">
							Temporary password: <code className="bg-white px-1.5 py-0.5 rounded">{result.password}</code>
							<span className="block text-xs text-gray-500 mt-1">
								Write this down and hand it to the learner — it won&apos;t be shown again.
							</span>
						</p>
					)}
				</div>
			)}

			{open && (
				<form onSubmit={handleSubmit} className="space-y-2 border-t pt-3">
					<input
						value={fullName}
						onChange={(e) => setFullName(e.target.value)}
						placeholder="Full name"
						className="w-full border rounded px-3 py-2 text-sm"
						required
					/>
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="Email (used as login ID)"
						className="w-full border rounded px-3 py-2 text-sm"
						required
					/>
					<input
						value={mobile}
						onChange={(e) => setMobile(e.target.value)}
						placeholder="Mobile number (optional)"
						className="w-full border rounded px-3 py-2 text-sm"
					/>
					<div className="flex gap-2">
						<select
							value={course}
							onChange={(e) => setCourse(e.target.value)}
							className="flex-1 border rounded px-3 py-2 text-sm"
						>
							<option value="">Enroll in course (optional)</option>
							{courses.map((c) => (
								<option key={c.name} value={c.name}>
									{c.title}
								</option>
							))}
						</select>
						<select
							value={group}
							onChange={(e) => setGroup(e.target.value)}
							className="flex-1 border rounded px-3 py-2 text-sm"
						>
							<option value="">Group (optional)</option>
							{groups.map((g) => (
								<option key={g.name} value={g.name}>
									{g.title}
								</option>
							))}
						</select>
					</div>
					{error && <p className="text-sm text-red-600">{error}</p>}
					<button
						type="submit"
						disabled={saving}
						className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{saving ? "Registering..." : "Register student"}
					</button>
				</form>
			)}
		</div>
	);
}
