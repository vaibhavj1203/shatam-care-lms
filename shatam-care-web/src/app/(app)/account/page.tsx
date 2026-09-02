"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { changeMyPassword } from "@/lib/lms-api";

export default function AccountPage() {
	const { user } = useAuth();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setDone(false);
		if (next !== confirm) {
			setError("The two new passwords don't match.");
			return;
		}
		setSaving(true);
		try {
			await changeMyPassword(current, next);
			setCurrent("");
			setNext("");
			setConfirm("");
			setDone(true);
		} catch (err) {
			// Frappe's strength rules come back as HTML; strip tags so the learner
			// reads a sentence rather than markup.
			const raw = err instanceof Error ? err.message : "Could not change your password.";
			setError(raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
		} finally {
			setSaving(false);
		}
	}

	if (!user) return null;

	return (
		<div className="max-w-md mx-auto px-6 py-10 space-y-5">
			<div>
				<h1 className="text-2xl font-semibold text-green-900">My account</h1>
				<p className="text-sm text-gray-700 mt-1">
					Signed in as <strong>{user.fullName}</strong> ({user.user})
				</p>
			</div>

			<form onSubmit={handleSubmit} className="bg-white rounded-lg border border-green-100 p-4 space-y-3">
				<h2 className="font-semibold text-green-800">Change password</h2>
				<p className="text-xs text-gray-600">
					Your account was created with a password someone else chose. Set your own here.
				</p>

				<label className="block text-sm">
					<span className="text-gray-900">Current password</span>
					<input
						type="password"
						value={current}
						onChange={(e) => setCurrent(e.target.value)}
						className="mt-1 w-full border border-gray-400 rounded px-3 py-2 text-sm"
						required
					/>
				</label>

				<label className="block text-sm">
					<span className="text-gray-900">New password</span>
					<input
						type="password"
						value={next}
						onChange={(e) => setNext(e.target.value)}
						className="mt-1 w-full border border-gray-400 rounded px-3 py-2 text-sm"
						required
					/>
				</label>

				<label className="block text-sm">
					<span className="text-gray-900">Confirm new password</span>
					<input
						type="password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						className="mt-1 w-full border border-gray-400 rounded px-3 py-2 text-sm"
						required
					/>
				</label>

				{error && <p className="text-sm text-red-600">{error}</p>}
				{done && <p className="text-sm text-green-700">Password changed. Use it next time you sign in.</p>}

				<button
					type="submit"
					disabled={saving}
					className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
				>
					{saving ? "Saving..." : "Change password"}
				</button>
			</form>
		</div>
	);
}
