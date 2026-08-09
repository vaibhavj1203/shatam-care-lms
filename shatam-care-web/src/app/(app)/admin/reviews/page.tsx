"use client";

import { useEffect, useState } from "react";
import { getPendingLessonReviews, reviewLesson } from "@/lib/lms-api";

type ReviewRow = { name: string; title: string; course: string; submitted_on: string };

export default function AdminReviewsPage() {
	const [rows, setRows] = useState<ReviewRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	function refresh() {
		let cancelled = false;
		getPendingLessonReviews()
			.then((data) => {
				if (!cancelled) setRows(data);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load pending reviews.");
			});
		return () => {
			cancelled = true;
		};
	}

	useEffect(refresh, []);

	async function handleDecision(lessonId: string, decision: "Approved" | "Rejected") {
		setBusy(lessonId);
		try {
			await reviewLesson(lessonId, decision);
			refresh();
		} finally {
			setBusy(null);
		}
	}

	if (error) return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	if (!rows) return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
			<h1 className="text-2xl font-semibold text-green-900">Content Review</h1>
			{rows.length === 0 && (
				<p className="text-gray-500 text-sm">Nothing pending review right now.</p>
			)}
			<div className="space-y-3">
				{rows.map((row) => (
					<div
						key={row.name}
						className="bg-white rounded-lg border border-green-100 p-4 flex items-center justify-between"
					>
						<div>
							<p className="font-medium text-green-800">{row.title}</p>
							<p className="text-xs text-gray-500">
								Course: {row.course} &middot; Submitted {row.submitted_on}
							</p>
						</div>
						<div className="flex gap-2">
							<button
								onClick={() => handleDecision(row.name, "Approved")}
								disabled={busy === row.name}
								className="bg-green-700 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
							>
								Approve
							</button>
							<button
								onClick={() => handleDecision(row.name, "Rejected")}
								disabled={busy === row.name}
								className="border border-red-400 text-red-600 rounded px-3 py-1.5 text-sm disabled:opacity-50"
							>
								Reject
							</button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
