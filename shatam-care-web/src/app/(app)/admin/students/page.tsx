"use client";

import { useEffect, useState } from "react";
import {
	AdminCourseRow,
	AppRole,
	Capability,
	CapabilityInfo,
	Person,
	StudentGroup,
	StudentRow,
	createUser,
	enrollStudent,
	listAllCourses,
	listCapabilities,
	listPeople,
	listStudentGroups,
	listStudents,
	updatePerson,
} from "@/lib/lms-api";

type Persona = "student" | "evaluator" | "admin";

// Three personas (PLAN.md 2). "Evaluator" is deliberately open-ended — it means
// whatever the admin delegates, which is why it alone exposes capability
// checkboxes. Admins hold every capability implicitly; students hold none.
const PERSONAS: { value: Persona; label: string; role: AppRole; hint: string }[] = [
	{
		value: "student",
		label: "Student",
		role: "LMS Student",
		hint: "Takes courses, earns certificates",
	},
	{
		value: "evaluator",
		label: "Evaluator",
		role: "Batch Evaluator",
		hint: "Does only what you tick below",
	},
	{ value: "admin", label: "Admin", role: "Moderator", hint: "Full access to everything" },
];

export default function AdminPeoplePage() {
	const [tab, setTab] = useState<"accounts" | "enrolments">("accounts");
	const [people, setPeople] = useState<Person[] | null>(null);
	const [students, setStudents] = useState<StudentRow[] | null>(null);
	const [courses, setCourses] = useState<AdminCourseRow[]>([]);
	const [groups, setGroups] = useState<StudentGroup[]>([]);
	const [capabilityList, setCapabilityList] = useState<CapabilityInfo[]>([]);
	const [error, setError] = useState<string | null>(null);

	async function reload() {
		const [p, s] = await Promise.all([listPeople(), listStudents()]);
		setPeople(p);
		setStudents(s);
	}

	useEffect(() => {
		let cancelled = false;
		Promise.all([
			listPeople(),
			listStudents(),
			listAllCourses(),
			listStudentGroups(),
			listCapabilities(),
		])
			.then(([p, s, c, g, caps]) => {
				if (cancelled) return;
				setPeople(p);
				setStudents(s);
				setCourses(c);
				setGroups(g);
				setCapabilityList(caps);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load people.");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (error) return <div className="max-w-4xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	if (!people || !students)
		return <div className="max-w-4xl mx-auto px-6 py-10 text-gray-600">Loading...</div>;

	return (
		<div className="max-w-4xl mx-auto px-6 py-10 space-y-5">
			<h1 className="text-2xl font-semibold text-green-900">People</h1>

			<AddPersonForm
				courses={courses}
				groups={groups}
				capabilityList={capabilityList}
				onDone={reload}
			/>

			<div className="flex gap-3 text-sm border-b">
				{(["accounts", "enrolments"] as const).map((t) => (
					<button
						key={t}
						onClick={() => setTab(t)}
						className={`px-3 py-2 -mb-px border-b-2 capitalize ${
							tab === t
								? "border-green-700 text-green-800 font-medium"
								: "border-transparent text-gray-600"
						}`}
					>
						{t}
					</button>
				))}
			</div>

			{tab === "accounts" ? (
				<PeopleTable
						people={people}
						capabilityList={capabilityList}
						courses={courses}
						groups={groups}
						onChanged={reload}
					/>
			) : (
				<EnrolmentsTable students={students} courses={courses} />
			)}
		</div>
	);
}

function AddPersonForm({
	courses,
	groups,
	capabilityList,
	onDone,
}: {
	courses: AdminCourseRow[];
	groups: StudentGroup[];
	capabilityList: CapabilityInfo[];
	onDone: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [fullName, setFullName] = useState("");
	const [mobile, setMobile] = useState("");
	const [persona, setPersona] = useState<Persona>("student");
	const [capabilities, setCapabilities] = useState<Capability[]>([]);
	const [course, setCourse] = useState("");
	const [group, setGroup] = useState("");
	const [saving, setSaving] = useState(false);
	const [result, setResult] = useState<{ user: string; password: string | null } | null>(null);
	const [error, setError] = useState<string | null>(null);

	const selected = PERSONAS.find((p) => p.value === persona)!;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			const created = await createUser(
				email,
				fullName,
				[selected.role],
				persona === "evaluator" ? capabilities : [],
				mobile || undefined,
			);
			if (persona === "student" && course) {
				await enrollStudent(course, created.user, group || undefined);
			}
			setResult({ user: created.user, password: created.password });
			setEmail("");
			setFullName("");
			setMobile("");
			setCapabilities([]);
			await onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not create this account.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="bg-white rounded-lg border border-green-100 p-4 space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-green-800">Add a person</h2>
				<button onClick={() => setOpen((v) => !v)} className="text-sm text-green-700 underline">
					{open ? "Cancel" : "+ New person"}
				</button>
			</div>
			<p className="text-xs text-gray-600">
				Creates an account and decides what they can do. Learners can&apos;t sign up themselves
				yet, so every account starts here.
			</p>

			{result && (
				<div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
					<p className="font-medium text-green-800">Created {result.user}</p>
					{result.password && (
						<p className="text-gray-800 mt-1">
							Temporary password:{" "}
							<code className="bg-white px-1.5 py-0.5 rounded">{result.password}</code>
							<span className="block text-xs text-gray-600 mt-1">
								Write this down and hand it over — it won&apos;t be shown again.
							</span>
						</p>
					)}
				</div>
			)}

			{open && (
				<form onSubmit={handleSubmit} className="space-y-3 border-t pt-3">
					<input
						value={fullName}
						onChange={(e) => setFullName(e.target.value)}
						placeholder="Full name"
						className="w-full border border-gray-400 rounded px-3 py-2 text-sm"
						required
					/>
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="Email (used as login ID)"
						className="w-full border border-gray-400 rounded px-3 py-2 text-sm"
						required
					/>
					<input
						value={mobile}
						onChange={(e) => setMobile(e.target.value)}
						placeholder="Mobile number (optional)"
						className="w-full border border-gray-400 rounded px-3 py-2 text-sm"
					/>

					<div className="space-y-1">
						<p className="text-sm font-medium text-gray-900">This person is a…</p>
						<div className="flex flex-wrap gap-4">
							{PERSONAS.map((p) => (
								<label key={p.value} className="flex items-start gap-2 text-sm">
									<input
										type="radio"
										name="persona"
										checked={persona === p.value}
										onChange={() => setPersona(p.value)}
										className="mt-1"
									/>
									<span>
										<span className="font-medium">{p.label}</span>
										<span className="block text-xs text-gray-600">{p.hint}</span>
									</span>
								</label>
							))}
						</div>
					</div>

					{persona === "evaluator" && (
						<div className="border border-green-200 bg-green-50 rounded p-3 space-y-2">
							<p className="text-sm font-medium text-gray-900">What may they do?</p>
							<p className="text-xs text-gray-600">
								Tick only what this person needs. With nothing ticked they can sign in but
								do nothing.
							</p>
							{capabilityList.map((cap) => (
								<label key={cap.key} className="flex items-start gap-2 text-sm">
									<input
										type="checkbox"
										checked={capabilities.includes(cap.key)}
										onChange={() =>
											setCapabilities((prev) =>
												prev.includes(cap.key)
													? prev.filter((c) => c !== cap.key)
													: [...prev, cap.key],
											)
										}
										className="mt-1"
									/>
									<span>
										<span className="font-medium">{cap.label}</span>
										<span className="block text-xs text-gray-600">{cap.description}</span>
									</span>
								</label>
							))}
						</div>
					)}

					{persona === "student" && (
						<div className="flex gap-2">
							<select
								value={course}
								onChange={(e) => setCourse(e.target.value)}
								className="flex-1 border border-gray-400 rounded px-3 py-2 text-sm"
							>
								<option value="">Enrol in course (optional)</option>
								{courses.map((c) => (
									<option key={c.name} value={c.name}>
										{c.title}
									</option>
								))}
							</select>
							<select
								value={group}
								onChange={(e) => setGroup(e.target.value)}
								className="flex-1 border border-gray-400 rounded px-3 py-2 text-sm"
							>
								<option value="">Group (optional)</option>
								{groups.map((g) => (
									<option key={g.name} value={g.name}>
										{g.title}
									</option>
								))}
							</select>
						</div>
					)}

					{error && <p className="text-sm text-red-600">{error}</p>}
					<button
						type="submit"
						disabled={saving}
						className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{saving ? "Creating..." : `Create ${selected.label.toLowerCase()}`}
					</button>
				</form>
			)}
		</div>
	);
}

function personaOf(person: Person) {
	if (person.roles.includes("Moderator")) return "Admin";
	if (person.roles.includes("Batch Evaluator")) return "Evaluator";
	if (person.roles.includes("Course Creator")) return "Teacher (legacy)";
	return "Student";
}

function EnrolPanel({
	member,
	courses,
	groups,
	onDone,
}: {
	member: string;
	courses: AdminCourseRow[];
	groups: StudentGroup[];
	onDone: () => Promise<void>;
}) {
	const [course, setCourse] = useState("");
	const [group, setGroup] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleEnrol() {
		if (!course) return;
		setSaving(true);
		setError(null);
		try {
			await enrollStudent(course, member, group || undefined);
			await onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not enrol this learner.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="mt-2 border-t pt-3 space-y-2">
			<p className="text-xs text-gray-600">Enrol {member} in a course.</p>
			<div className="flex flex-wrap gap-2">
				<select
					value={course}
					onChange={(e) => setCourse(e.target.value)}
					className="flex-1 min-w-48 border border-gray-400 rounded px-3 py-2 text-sm"
				>
					<option value="">Choose a course…</option>
					{courses.map((c) => (
						<option key={c.name} value={c.name}>
							{c.title}
						</option>
					))}
				</select>
				<select
					value={group}
					onChange={(e) => setGroup(e.target.value)}
					className="border border-gray-400 rounded px-3 py-2 text-sm"
				>
					<option value="">Group (optional)</option>
					{groups.map((g) => (
						<option key={g.name} value={g.name}>
							{g.title}
						</option>
					))}
				</select>
				<button
					onClick={handleEnrol}
					disabled={saving || !course}
					className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
				>
					{saving ? "Enrolling…" : "Enrol"}
				</button>
			</div>
			{error && <p className="text-sm text-red-600">{error}</p>}
		</div>
	);
}

function PeopleTable({
	people,
	capabilityList,
	courses,
	groups,
	onChanged,
}: {
	people: Person[];
	capabilityList: CapabilityInfo[];
	courses: AdminCourseRow[];
	groups: StudentGroup[];
	onChanged: () => Promise<void>;
}) {
	const [editing, setEditing] = useState<string | null>(null);
	const [enrolling, setEnrolling] = useState<string | null>(null);

	return (
		<div className="bg-white rounded-lg border border-green-100 divide-y">
			{people.length === 0 && <p className="p-4 text-sm text-gray-600">No accounts yet.</p>}
			{people.map((person) => {
				const persona = personaOf(person);
				const canDelegate = persona === "Evaluator";
				const isStudent = persona === "Student";
				return (
					<div key={person.user} className="p-4 space-y-2">
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="font-medium text-green-800">{person.full_name}</p>
								<p className="text-xs text-gray-600">{person.user}</p>
							</div>
							<div className="flex items-center gap-3">
								<span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
									{persona}
								</span>
								{canDelegate && (
									<button
										onClick={() => setEditing(editing === person.user ? null : person.user)}
										className="text-xs text-green-700 underline"
									>
										{editing === person.user ? "Close" : "Edit rights"}
									</button>
								)}
								{isStudent && (
									<button
										onClick={() =>
											setEnrolling(enrolling === person.user ? null : person.user)
										}
										className="text-xs text-green-700 underline"
									>
										{enrolling === person.user ? "Close" : "Enrol in course"}
									</button>
								)}
							</div>
						</div>

						{canDelegate && (
							<p className="text-xs text-gray-600">
								{person.capabilities.length
									? `Can: ${person.capabilities
											.map((c) => capabilityList.find((x) => x.key === c)?.label ?? c)
											.join(", ")}`
									: "No rights granted yet — can sign in but do nothing."}
							</p>
						)}

						{enrolling === person.user && (
							<EnrolPanel
								member={person.user}
								courses={courses}
								groups={groups}
								onDone={async () => {
									setEnrolling(null);
									await onChanged();
								}}
							/>
						)}
						{editing === person.user && (
							<CapabilityEditor
								person={person}
								capabilityList={capabilityList}
								onSaved={async () => {
									setEditing(null);
									await onChanged();
								}}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

function CapabilityEditor({
	person,
	capabilityList,
	onSaved,
}: {
	person: Person;
	capabilityList: CapabilityInfo[];
	onSaved: () => Promise<void>;
}) {
	const [selected, setSelected] = useState<Capability[]>(person.capabilities);
	const [saving, setSaving] = useState(false);

	return (
		<div className="border border-green-200 bg-green-50 rounded p-3 space-y-2">
			{capabilityList.map((cap) => (
				<label key={cap.key} className="flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						checked={selected.includes(cap.key)}
						onChange={() =>
							setSelected((prev) =>
								prev.includes(cap.key)
									? prev.filter((c) => c !== cap.key)
									: [...prev, cap.key],
							)
						}
						className="mt-1"
					/>
					<span>
						<span className="font-medium">{cap.label}</span>
						<span className="block text-xs text-gray-600">{cap.description}</span>
					</span>
				</label>
			))}
			<button
				onClick={async () => {
					setSaving(true);
					try {
						await updatePerson(person.user, undefined, selected);
						await onSaved();
					} finally {
						setSaving(false);
					}
				}}
				disabled={saving}
				className="bg-green-700 text-white rounded px-3 py-1.5 text-xs disabled:opacity-50"
			>
				{saving ? "Saving..." : "Save rights"}
			</button>
			<p className="text-xs text-gray-600">
				Rights are read at sign-in, so they take effect next time this person logs in.
			</p>
		</div>
	);
}

function EnrolmentsTable({
	students,
	courses,
}: {
	students: StudentRow[];
	courses: AdminCourseRow[];
}) {
	const [courseFilter, setCourseFilter] = useState("");
	const rows = courseFilter ? students.filter((s) => s.course === courseFilter) : students;

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<label className="text-sm text-gray-700">Course:</label>
				<select
					value={courseFilter}
					onChange={(e) => setCourseFilter(e.target.value)}
					className="border border-gray-400 rounded px-3 py-1.5 text-sm"
				>
					<option value="">All courses</option>
					{courses.map((c) => (
						<option key={c.name} value={c.name}>
							{c.title}
						</option>
					))}
				</select>
			</div>

			<div className="bg-white rounded-lg border border-green-100 overflow-hidden">
				<table className="w-full text-sm">
					<thead className="bg-green-50 text-green-800">
						<tr>
							<th className="text-left px-4 py-2">Learner</th>
							<th className="text-left px-4 py-2">Course</th>
							<th className="text-left px-4 py-2">Progress</th>
							<th className="text-left px-4 py-2">Group</th>
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 && (
							<tr>
								<td colSpan={4} className="px-4 py-6 text-center text-gray-600">
									No enrolments found.
								</td>
							</tr>
						)}
						{rows.map((row) => (
							<tr key={row.name} className="border-t">
								<td className="px-4 py-2">
									{row.member_name}
									<span className="text-gray-500 text-xs block">{row.member}</span>
								</td>
								<td className="px-4 py-2">{row.course}</td>
								<td className="px-4 py-2">{Math.round(row.progress ?? 0)}%</td>
								<td className="px-4 py-2">{row.student_group ?? "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
