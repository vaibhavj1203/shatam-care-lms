"use client";

import { useEffect, useState } from "react";
import { FRAPPE_URL } from "@/lib/frappe-client";
import { MyCertificate, getMyCertificates } from "@/lib/lms-api";

export default function CertificatesPage() {
	const [rows, setRows] = useState<MyCertificate[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getMyCertificates()
			.then((data) => {
				if (!cancelled) setRows(data);
			})
			.catch(() => {
				if (!cancelled) setError("Could not load your certificates.");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (error) return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	if (!rows) return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
			<h1 className="text-2xl font-semibold text-green-900">My Certificates</h1>
			{rows.length === 0 && (
				<p className="text-gray-500 text-sm">
					No certificates yet. Complete a course and pass its final assessment to earn one.
				</p>
			)}
			<div className="space-y-3">
				{rows.map((row) => (
					<div key={row.name} className="bg-white rounded-lg border border-green-100 p-4">
						<p className="font-medium text-green-800">{row.course_title || row.course}</p>
						<p className="text-xs text-gray-500 mt-0.5">
							Issued {row.issue_date} &middot; ID {row.certificate_uid}
						</p>
						<div className="flex gap-3 mt-2 text-sm">
							<a
								href={`${FRAPPE_URL}/verify?id=${row.certificate_uid}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-green-700 underline"
							>
								Verification page
							</a>
							<a
								href={`${FRAPPE_URL}/api/method/frappe.utils.print_format.download_pdf?doctype=LMS%20Certificate&name=${encodeURIComponent(row.name)}&format=Certificate`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-green-700 underline"
							>
								Download PDF
							</a>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
