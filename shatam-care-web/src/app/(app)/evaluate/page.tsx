"use client";

import { useEffect, useState } from "react";
import { EligibilityQueueRow, getEvaluatorQueue, approveCertificate, rejectCertificate } from "@/lib/lms-api";

export default function EvaluatorQueuePage() {
	const [rows, setRows] = useState<EligibilityQueueRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

	function refresh() {
		let cancelled = false;
		getEvaluatorQueue()
			.then((data) => {
				if (!cancelled) setRows(data);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load the approval queue.");
			});
		return () => {
			cancelled = true;
		};
	}

	useEffect(refresh, []);

	async function handleApprove(name: string) {
		setBusy(name);
		try {
			await approveCertificate(name);
			refresh();
		} finally {
			setBusy(null);
		}
	}

	async function handleReject(name: string) {
		setBusy(name);
		try {
			await rejectCertificate(name, rejectReason[name] ?? "");
			refresh();
		} finally {
			setBusy(null);
		}
	}

	if (error) return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	if (!rows) return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
			<h1 className="text-2xl font-semibold text-green-900">Certificate Approvals</h1>
			<p className="text-sm text-gray-500">
				These students have completed all lessons, in-video checkpoints, and the final
				assessment. Approve to issue their certificate.
			</p>
			{rows.length === 0 && (
				<p className="text-gray-500 text-sm">No certificates pending approval.</p>
			)}
			<div className="space-y-3">
				{rows.map((row) => (
					<div key={row.name} className="bg-white rounded-lg border border-green-100 p-4 space-y-2">
						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-green-800">{row.member}</p>
								<p className="text-xs text-gray-500">
									Course: {row.course} &middot; Eligible since {row.auto_gated_on}
								</p>
							</div>
							<button
								onClick={() => handleApprove(row.name)}
								disabled={busy === row.name}
								className="bg-green-700 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
							>
								Approve &amp; issue certificate
							</button>
						</div>
						<div className="flex gap-2">
							<input
								value={rejectReason[row.name] ?? ""}
								onChange={(e) =>
									setRejectReason((prev) => ({ ...prev, [row.name]: e.target.value }))
								}
								placeholder="Reason for rejection (optional)"
								className="flex-1 border rounded px-2 py-1 text-sm"
							/>
							<button
								onClick={() => handleReject(row.name)}
								disabled={busy === row.name}
								className="border border-red-400 text-red-600 rounded px-3 py-1 text-sm disabled:opacity-50"
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
