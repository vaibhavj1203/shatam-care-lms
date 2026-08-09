"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ROLES } from "@/lib/roles";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
	const { user, ready, logout, hasRole } = useAuth();
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
				<nav className="flex items-center gap-4 text-sm flex-wrap justify-end">
					{hasRole(ROLES.STUDENT) && (
						<>
							<Link href="/courses">Courses</Link>
							<Link href="/certificates">Certificates</Link>
						</>
					)}
					{hasRole(ROLES.TEACHER) && <Link href="/teach">My Lessons</Link>}
					{hasRole(ROLES.ADMIN) && (
						<>
							<Link href="/admin/courses">Manage Courses</Link>
							<Link href="/admin/students">Students</Link>
							<Link href="/admin/groups">Groups</Link>
							<Link href="/admin/reviews">Review</Link>
						</>
					)}
					{hasRole(ROLES.EVALUATOR) && <Link href="/evaluate">Approvals</Link>}
					<span className="opacity-80">{user.fullName}</span>
					<button onClick={logout} className="underline">
						Sign out
					</button>
				</nav>
			</header>
			<main className="flex-1 bg-gray-50">{children}</main>
		</div>
	);
}
