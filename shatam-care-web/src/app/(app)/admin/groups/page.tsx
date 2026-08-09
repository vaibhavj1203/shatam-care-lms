"use client";

import { useEffect, useState } from "react";
import { StudentGroup, createStudentGroup, listStudentGroups } from "@/lib/lms-api";

export default function AdminGroupsPage() {
	const [groups, setGroups] = useState<StudentGroup[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [region, setRegion] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		listStudentGroups()
			.then((rows) => {
				if (!cancelled) setGroups(rows);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load student groups.");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	async function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			await createStudentGroup({ title, region: region || undefined });
			setTitle("");
			setRegion("");
			setGroups(await listStudentGroups());
		} finally {
			setSaving(false);
		}
	}

	if (error) return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	if (!groups) return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-5">
			<div>
				<h1 className="text-2xl font-semibold text-green-900">Student Groups</h1>
				<p className="text-sm text-gray-500 mt-1">
					Internal tags for reporting by region or field coordinator. Students never see these.
				</p>
			</div>

			<form
				onSubmit={handleCreate}
				className="bg-white rounded-lg border border-green-100 p-4 space-y-2"
			>
				<div className="flex gap-2">
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Group title (e.g. Nashik — Coordinator Priya)"
						className="flex-1 border rounded px-3 py-2 text-sm"
						required
					/>
					<input
						value={region}
						onChange={(e) => setRegion(e.target.value)}
						placeholder="Region/district"
						className="w-48 border rounded px-3 py-2 text-sm"
					/>
					<button
						type="submit"
						disabled={saving}
						className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{saving ? "Adding..." : "Add"}
					</button>
				</div>
			</form>

			<div className="space-y-2">
				{groups.length === 0 && <p className="text-gray-500 text-sm">No groups yet.</p>}
				{groups.map((group) => (
					<div key={group.name} className="bg-white rounded-lg border border-green-100 p-3">
						<p className="font-medium text-green-800 text-sm">{group.title}</p>
						{group.region && <p className="text-xs text-gray-500">{group.region}</p>}
					</div>
				))}
			</div>
		</div>
	);
}
