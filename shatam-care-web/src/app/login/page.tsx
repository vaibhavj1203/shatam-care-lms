"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FrappeApiError } from "@/lib/frappe-client";

export default function LoginPage() {
	const { login } = useAuth();
	const router = useRouter();
	const [usr, setUsr] = useState("");
	const [pwd, setPwd] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			await login(usr, pwd);
			router.push("/dashboard");
		} catch (err) {
			setError(err instanceof FrappeApiError ? err.message : "Login failed. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="flex-1 flex items-center justify-center bg-green-50 px-4">
			<form
				onSubmit={handleSubmit}
				className="w-full max-w-sm bg-white rounded-lg shadow p-8 space-y-4"
			>
				<h1 className="text-xl font-semibold text-green-800 text-center">
					Shatam Care Learning
				</h1>
				<p className="text-sm text-gray-500 text-center">
					Sign in to continue your training
				</p>

				<div className="space-y-1">
					<label className="text-sm font-medium text-gray-700">
						Phone number or email
					</label>
					<input
						type="text"
						value={usr}
						onChange={(e) => setUsr(e.target.value)}
						className="w-full border rounded px-3 py-2"
						required
					/>
				</div>

				<div className="space-y-1">
					<label className="text-sm font-medium text-gray-700">Password</label>
					<input
						type="password"
						value={pwd}
						onChange={(e) => setPwd(e.target.value)}
						className="w-full border rounded px-3 py-2"
						required
					/>
				</div>

				{error && <p className="text-sm text-red-600">{error}</p>}

				<button
					type="submit"
					disabled={submitting}
					className="w-full bg-green-700 text-white rounded py-2 font-medium disabled:opacity-50"
				>
					{submitting ? "Signing in..." : "Sign in"}
				</button>
			</form>
		</div>
	);
}
