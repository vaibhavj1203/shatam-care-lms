"use client";

import { decodeParam } from "@/lib/route-params";
import { use, useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getLessonCheckpoints, getLessonForStudent, markLessonComplete, submitCheckpointAttempt, Checkpoint } from "@/lib/lms-api";
import { createPlayer, extractYouTubeId, getPlayerState, loadYouTubeApi, YouTubePlayer } from "@/lib/youtube";

type LessonDoc = {
	name: string;
	title: string;
	course: string;
	chapter: string;
	youtube: string;
};

const PLAYER_ELEMENT_ID = "shatam-care-lesson-player";
const POLL_INTERVAL_MS = 500;
// How close to the end counts as "finished". YouTube often stops firing time
// updates a beat before the true duration, and a learner who closes the tab on
// the last second has genuinely watched the lesson.
const END_TOLERANCE_SECONDS = 2;

export default function LessonPlayerPage({
	params,
}: {
	params: Promise<{ id: string; lessonId: string }>;
}) {
	const { id: rawCourseId, lessonId: rawLessonId } = use(params);
	const courseId = decodeParam(rawCourseId);
	const lessonId = decodeParam(rawLessonId);
	const { user } = useAuth();

	const [lesson, setLesson] = useState<LessonDoc | null>(null);
	const [pendingCheckpoints, setPendingCheckpoints] = useState<Checkpoint[]>([]);
	const [activeCheckpoint, setActiveCheckpoint] = useState<Checkpoint | null>(null);
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [answerResult, setAnswerResult] = useState<"correct" | "incorrect" | null>(null);
	const [completed, setCompleted] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [completeError, setCompleteError] = useState<string | null>(null);

	const playerRef = useRef<YouTubePlayer | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const handledCheckpointIds = useRef<Set<string>>(new Set());
	// Guards against the poll and the ENDED event both firing a completion for
	// the same lesson. A ref, not state, because both callers need to see the
	// update immediately rather than on the next render.
	const completingRef = useRef(false);

	useEffect(() => {
		let cancelled = false;
		Promise.all([getLessonForStudent(lessonId), getLessonCheckpoints(lessonId)])
			.then(([lessonDoc, checkpoints]) => {
				if (cancelled) return;
				setLesson(lessonDoc);
				setPendingCheckpoints(checkpoints.filter((c) => !c.already_attempted));
			})
			.catch(() => {
				if (!cancelled) setLoadError("Could not load this lesson. Please try again.");
			});
		return () => {
			cancelled = true;
		};
	}, [lessonId]);

	// Recording completion is what unlocks the certificate, so a silent failure
	// here strands a learner who has genuinely finished the course: the
	// eligibility gate needs a Complete progress row for every lesson, and
	// nothing on screen would explain its absence. Hence the explicit error and
	// retry rather than a bare await.
	const completeLesson = useCallback(async () => {
		if (!lesson || !user || completed || completingRef.current) return;
		completingRef.current = true;
		try {
			await markLessonComplete(lesson.course, lesson.name);
			setCompleted(true);
			setCompleteError(null);
		} catch {
			completingRef.current = false;
			setCompleteError(
				"We couldn't record that you finished this lesson. Your certificate needs this, so please retry.",
			);
		}
	}, [lesson, user, completed]);

	// The player's onStateChange closure is created once per lesson, so it would
	// otherwise capture the first completeLesson forever.
	const completeLessonRef = useRef(completeLesson);
	useEffect(() => {
		completeLessonRef.current = completeLesson;
	}, [completeLesson]);

	const tick = useCallback(() => {
		const player = playerRef.current;
		if (!player || activeCheckpoint) return;
		const currentTime = player.getCurrentTime();
		const next = pendingCheckpoints.find(
			(c) => !handledCheckpointIds.current.has(c.name) && currentTime >= c.timestamp_seconds,
		);
		if (next) {
			player.pauseVideo();
			setActiveCheckpoint(next);
			return;
		}

		// Completion is driven from the poll and not only from YouTube's ENDED
		// event. ENDED proved unreliable in practice — it never arrives if the
		// learner closes the tab on the final seconds, and it is missed
		// entirely when the player is torn down on navigation. Learners who had
		// watched everything and passed the assessment were left with zero
		// lesson progress, so they never reached the approval queue.
		const duration = player.getDuration();
		if (duration > 0 && currentTime >= duration - END_TOLERANCE_SECONDS) {
			completeLesson();
		}
	}, [pendingCheckpoints, activeCheckpoint, completeLesson]);

	useEffect(() => {
		if (!lesson) return;
		let destroyed = false;

		loadYouTubeApi().then(() => {
			if (destroyed) return;
			const videoId = extractYouTubeId(lesson.youtube);
			playerRef.current = createPlayer(PLAYER_ELEMENT_ID, videoId, {
				onStateChange: (event) => {
					if (event.data === getPlayerState().ENDED) {
						completeLessonRef.current();
					}
				},
			});
			pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
		});

		return () => {
			destroyed = true;
			if (pollRef.current) clearInterval(pollRef.current);
			playerRef.current?.destroy();
		};
		// Intentionally only recreate the player when the lesson itself
		// changes — `tick` is kept fresh via the polling-refresh effect below,
		// and completion via completeLessonRef, instead of tearing down the
		// player.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lesson]);

	// Keep the polling closure up to date with the latest pending/active state
	// without tearing down and recreating the player.
	useEffect(() => {
		if (!pollRef.current) return;
		clearInterval(pollRef.current);
		pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
	}, [tick]);

	async function handleAnswerSubmit() {
		if (!activeCheckpoint || selectedIndex === null) return;
		const result = await submitCheckpointAttempt(activeCheckpoint.name, selectedIndex);
		setAnswerResult(result.is_correct ? "correct" : "incorrect");
	}

	function handleResume() {
		if (activeCheckpoint) handledCheckpointIds.current.add(activeCheckpoint.name);
		setActiveCheckpoint(null);
		setSelectedIndex(null);
		setAnswerResult(null);
		playerRef.current?.playVideo();
	}

	if (loadError) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{loadError}</div>;
	}
	if (!lesson) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;
	}

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
			<Link href={`/courses/${courseId}`} className="text-sm text-green-700 hover:underline">
				&larr; Back to course
			</Link>
			<h1 className="text-xl font-semibold text-green-900">{lesson.title}</h1>

			<div className="relative bg-black aspect-video rounded overflow-hidden">
				<div id={PLAYER_ELEMENT_ID} className="w-full h-full" />

				{activeCheckpoint && (
					<div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6">
						<div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
							<p className="font-medium text-gray-800">{activeCheckpoint.question_text}</p>

							{answerResult === null ? (
								<>
									<div className="space-y-2">
										{activeCheckpoint.options?.map((option, index) => (
											<label
												key={`${option.option_text}-${index}`}
												className="flex items-center gap-2 text-sm"
											>
												<input
													type="radio"
													name="checkpoint-option"
													checked={selectedIndex === index}
													onChange={() => setSelectedIndex(index)}
												/>
												{option.option_text}
											</label>
										))}
									</div>
									<button
										onClick={handleAnswerSubmit}
										disabled={selectedIndex === null}
										className="w-full bg-green-700 text-white rounded py-2 text-sm disabled:opacity-50"
									>
										Submit answer
									</button>
								</>
							) : (
								<>
									<p
										className={
											answerResult === "correct" ? "text-green-700" : "text-amber-700"
										}
									>
										{answerResult === "correct"
											? "Correct!"
											: "That wasn't quite right — let's continue."}
									</p>
									<button
										onClick={handleResume}
										className="w-full bg-green-700 text-white rounded py-2 text-sm"
									>
										Continue watching
									</button>
								</>
							)}
						</div>
					</div>
				)}
			</div>

			{completed && (
				<p className="text-green-700 text-sm font-medium">
					Lesson marked complete. Great work!
				</p>
			)}

			{!completed && completeError && (
				<div className="rounded border border-red-200 bg-red-50 p-3 space-y-2">
					<p className="text-red-700 text-sm">{completeError}</p>
					<button
						onClick={completeLesson}
						className="bg-green-700 text-white rounded px-3 py-1.5 text-sm"
					>
						Retry
					</button>
				</div>
			)}
		</div>
	);
}
