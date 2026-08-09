"use client";

import { decodeParam } from "@/lib/route-params";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
	AssessmentQuestion,
	FinalAssessment,
	getFinalAssessment,
	submitFinalAssessment,
} from "@/lib/lms-api";

type Result = { score: number; score_out_of: number; percentage: number; pass: boolean };

export default function FinalAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
	const { id: rawCourseId } = use(params);
	const courseId = decodeParam(rawCourseId);

	const [data, setData] = useState<FinalAssessment | null>(null);
	const [error, setError] = useState<string | null>(null);
	// question name -> selected option texts (array, since multi-answer questions exist)
	const [answers, setAnswers] = useState<Record<string, string[]>>({});
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<Result | null>(null);

	useEffect(() => {
		let cancelled = false;
		getFinalAssessment(courseId)
			.then((res) => {
				if (!cancelled) setData(res);
			})
			.catch((err) => {
				if (!cancelled) setError(err?.message ?? "Could not load the assessment.");
			});
		return () => {
			cancelled = true;
		};
	}, [courseId]);

	function toggleAnswer(questionName: string, option: string, multiple: boolean) {
		setAnswers((prev) => {
			const current = prev[questionName] ?? [];
			if (!multiple) return { ...prev, [questionName]: [option] };
			return {
				...prev,
				[questionName]: current.includes(option)
					? current.filter((o) => o !== option)
					: [...current, option],
			};
		});
	}

	async function handleSubmit() {
		if (!data || !data.exists) return;
		setSubmitting(true);
		setError(null);
		try {
			const results = data.quiz.questions.map((row) => ({
				question_name: row.question,
				answer: answers[row.question] ?? [],
			}));
			const res = await submitFinalAssessment(courseId, results);
			setResult(res);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Could not submit your assessment. Please try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	if (error && !data) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{error}</div>;
	}
	if (!data) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;
	}
	if (!data.exists) {
		return (
			<div className="max-w-3xl mx-auto px-6 py-10 space-y-3">
				<BackLink courseId={courseId} />
				<p className="text-gray-500">
					This course doesn&apos;t have a final assessment yet. Check back later.
				</p>
			</div>
		);
	}

	const { quiz, questions_by_name, has_passed, attempts, attempts_used } = data;
	const attemptsLeft = quiz.max_attempts ? quiz.max_attempts - attempts_used : null;

	if (result) {
		return (
			<div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
				<BackLink courseId={courseId} />
				<div
					className={`rounded-lg border p-6 ${
						result.pass ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"
					}`}
				>
					<h1 className="text-xl font-semibold mb-2">
						{result.pass ? "You passed!" : "Not quite there yet"}
					</h1>
					<p className="text-sm text-gray-700">
						Score: {result.score} / {result.score_out_of} ({result.percentage}%). Passing mark is{" "}
						{quiz.passing_percentage}%.
					</p>
					{result.pass && (
						<p className="text-sm text-green-800 mt-2">
							Your certificate is now awaiting evaluator approval. You&apos;ll see it on the
							course page once approved.
						</p>
					)}
					{!result.pass && (
						<p className="text-sm text-amber-800 mt-2">
							Review the lessons and try again when you&apos;re ready.
						</p>
					)}
				</div>
				<Link href={`/courses/${courseId}`} className="text-green-700 underline text-sm">
					Return to course
				</Link>
			</div>
		);
	}

	if (has_passed) {
		const best = attempts.find((a) => a.passed);
		return (
			<div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
				<BackLink courseId={courseId} />
				<div className="rounded-lg border border-green-300 bg-green-50 p-6">
					<h1 className="text-xl font-semibold text-green-900 mb-1">Assessment already passed</h1>
					<p className="text-sm text-gray-700">
						You scored {best?.percentage}% on {new Date(best?.creation ?? "").toLocaleDateString()}.
					</p>
				</div>
			</div>
		);
	}

	if (attemptsLeft !== null && attemptsLeft <= 0) {
		return (
			<div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
				<BackLink courseId={courseId} />
				<p className="text-red-600">
					You&apos;ve used all {quiz.max_attempts} attempts for this assessment. Please contact
					your coordinator.
				</p>
			</div>
		);
	}

	const answeredCount = quiz.questions.filter(
		(row) => (answers[row.question] ?? []).length > 0,
	).length;
	const allAnswered = answeredCount === quiz.questions.length;

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
			<BackLink courseId={courseId} />

			<div>
				<h1 className="text-2xl font-semibold text-green-900">{quiz.title}</h1>
				<p className="text-sm text-gray-500 mt-1">
					{quiz.questions.length} questions &middot; pass mark {quiz.passing_percentage}%
					{attemptsLeft !== null && ` · ${attemptsLeft} attempt(s) left`}
				</p>
			</div>

			{error && <p className="text-sm text-red-600">{error}</p>}

			<div className="space-y-4">
				{quiz.questions.map((row, index) => {
					const question: AssessmentQuestion | undefined = questions_by_name[row.question];
					if (!question) return null;
					const options = [
						question.option_1,
						question.option_2,
						question.option_3,
						question.option_4,
					].filter((o): o is string => !!o);
					const multiple = !!question.multiple;
					const selected = answers[row.question] ?? [];

					return (
						<div
							key={row.question}
							className="bg-white rounded-lg border border-green-100 p-5 space-y-3"
						>
							<div className="flex gap-2">
								<span className="text-gray-400 text-sm">{index + 1}.</span>
								<div
									className="text-gray-800 flex-1"
									dangerouslySetInnerHTML={{ __html: question.question }}
								/>
							</div>
							{multiple && (
								<p className="text-xs text-gray-500 ml-6">Select all that apply</p>
							)}
							<div className="space-y-2 ml-6">
								{options.map((option) => (
									<label key={option} className="flex items-start gap-2 text-sm cursor-pointer">
										<input
											type={multiple ? "checkbox" : "radio"}
											name={`q-${row.question}`}
											checked={selected.includes(option)}
											onChange={() => toggleAnswer(row.question, option, multiple)}
											className="mt-1"
										/>
										<span>{option}</span>
									</label>
								))}
							</div>
						</div>
					);
				})}
			</div>

			<div className="flex items-center gap-4">
				<button
					onClick={handleSubmit}
					disabled={submitting || !allAnswered}
					className="bg-green-700 text-white rounded px-6 py-2.5 font-medium disabled:opacity-50"
				>
					{submitting ? "Submitting..." : "Submit assessment"}
				</button>
				<span className="text-sm text-gray-500">
					{answeredCount} of {quiz.questions.length} answered
				</span>
			</div>
		</div>
	);
}

function BackLink({ courseId }: { courseId: string }) {
	return (
		<Link href={`/courses/${courseId}`} className="text-sm text-green-700 hover:underline">
			&larr; Back to course
		</Link>
	);
}
