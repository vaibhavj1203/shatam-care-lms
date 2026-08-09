"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ROLES } from "@/lib/roles";

export default function DashboardPage() {
	const { user, hasRole } = useAuth();
	if (!user) return null;

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
			<h1 className="text-2xl font-semibold text-green-900">Welcome, {user.fullName}</h1>

			<div className="grid gap-4 sm:grid-cols-2">
				{hasRole(ROLES.STUDENT) && (
					<>
						<DashboardCard
							href="/courses"
							title="My Courses"
							description="Continue your lessons, quizzes, and assessments."
						/>
						<DashboardCard
							href="/certificates"
							title="My Certificates"
							description="View and download the certificates you've earned."
						/>
					</>
				)}
				{hasRole(ROLES.TEACHER) && (
					<DashboardCard
						href="/teach"
						title="My Lessons"
						description="Upload chapters, lessons, and in-video quiz checkpoints."
					/>
				)}
				{hasRole(ROLES.ADMIN) && (
					<>
						<DashboardCard
							href="/admin/courses"
							title="Manage Courses"
							description="Create courses, assign teachers and evaluators, build assessments."
						/>
						<DashboardCard
							href="/admin/students"
							title="Students"
							description="Register learners, enroll them, and track progress."
						/>
						<DashboardCard
							href="/admin/groups"
							title="Student Groups"
							description="Organise learners by region or field coordinator."
						/>
						<DashboardCard
							href="/admin/reviews"
							title="Content Review"
							description="Approve or reject lessons submitted by teachers."
						/>
					</>
				)}
				{hasRole(ROLES.EVALUATOR) && (
					<DashboardCard
						href="/evaluate"
						title="Certificate Approvals"
						description="Review students who are eligible for certification."
					/>
				)}
			</div>
		</div>
	);
}

function DashboardCard({
	href,
	title,
	description,
}: {
	href: string;
	title: string;
	description: string;
}) {
	return (
		<Link
			href={href}
			className="block rounded-lg border border-green-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
		>
			<h2 className="font-semibold text-green-800">{title}</h2>
			<p className="text-sm text-gray-500 mt-1">{description}</p>
		</Link>
	);
}
