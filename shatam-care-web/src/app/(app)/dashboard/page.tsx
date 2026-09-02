"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
	const { user, can, isLearner } = useAuth();
	if (!user) return null;

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
			<h1 className="text-2xl font-semibold text-green-900">Welcome, {user.fullName}</h1>

			<div className="grid gap-4 sm:grid-cols-2">
				{isLearner && (
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
				{can("content") && (
					<DashboardCard
						href="/teach"
						title="Course Content"
						description="Add chapters, lessons and in-video quiz checkpoints."
					/>
				)}
				{can("courses") && (
					<DashboardCard
						href="/admin/courses"
						title="Manage Courses"
						description="Create courses, set up final assessments, and publish."
					/>
				)}
				{can("people") && (
					<>
						<DashboardCard
							href="/admin/students"
							title="People"
							description="Create accounts, set what they can do, enrol learners."
						/>
						<DashboardCard
							href="/admin/groups"
							title="Student Groups"
							description="Organise learners by region or field coordinator."
						/>
					</>
				)}
				{can("review") && (
					<DashboardCard
						href="/admin/reviews"
						title="Content Review"
						description="Approve or reject lessons submitted for review."
					/>
				)}
				{can("certificates") && (
					<DashboardCard
						href="/evaluate"
						title="Certificate Approvals"
						description="Review eligible learners and issue their certificates."
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
