"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
	const { user, ready, logout, can, isLearner } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (ready && !user) router.replace("/login");
	}, [ready, user, router]);

	if (!ready || !user) return null;

	return (
		<div className="flex-1 flex flex-col">
			<header className="bg-green-800 text-white px-6 py-3 flex items-center justify-between">
				<Link href="/dashboard" className="font-semibold">
					Shatam Care Learning
				</Link>
				{/* Navigation follows capabilities, not roles. An evaluator holds
				    whatever subset the admin delegated, so each link is gated on
				    the specific right it needs. Learner links are gated on
				    isLearner rather than the LMS Student role, because Frappe's
				    Administrator holds every role and would otherwise get a
				    learner dashboard it has no use for. */}
				<nav className="flex items-center gap-4 text-sm flex-wrap justify-end">
					{isLearner && (
						<>
							<Link href="/courses">Courses</Link>
							<Link href="/certificates">Certificates</Link>
						</>
					)}
					{can("content") && <Link href="/teach">Content</Link>}
					{can("courses") && <Link href="/admin/courses">Courses</Link>}
					{can("people") && (
						<>
							<Link href="/admin/students">People</Link>
							<Link href="/admin/groups">Groups</Link>
						</>
					)}
					{can("review") && <Link href="/admin/reviews">Review</Link>}
					{can("certificates") && <Link href="/evaluate">Approvals</Link>}
					<Link href="/account" className="opacity-90 underline decoration-dotted">
						{user.fullName}
					</Link>
					<button onClick={logout} className="underline">
						Sign out
					</button>
				</nav>
			</header>
			<main className="flex-1 bg-gray-50">{children}</main>
		</div>
	);
}
