"use client";

import { decodeParam } from "@/lib/route-params";
import { use, useEffect, useRef, useState } from "react";
import {
	CheckpointDetail,
	createCheckpoint,
	deleteCheckpoint,
	getAllLessonCheckpoints,
	getAvailableLanguages,
	getCheckpointDetail,
	getLessonForTeacher,
	saveCheckpointTranslation,
	submitLessonForReview,
	updateCheckpoint,
} from "@/lib/lms-api";
import { createPlayer, extractYouTubeId, loadYouTubeApi, YouTubePlayer } from "@/lib/youtube";

const PLAYER_ELEMENT_ID = "shatam-care-authoring-player";

type LessonDoc = Awaited<ReturnType<typeof getLessonForTeacher>>;
type CheckpointRow = Awaited<ReturnType<typeof getAllLessonCheckpoints>>[number];

export default function LessonAuthoringPage({
	params,
}: {
	params: Promise<{ lessonId: string }>;
}) {
	const { lessonId: rawLessonId } = use(params);
	const lessonId = decodeParam(rawLessonId);

	const [lesson, setLesson] = useState<LessonDoc | null>(null);
	const [checkpoints, setCheckpoints] = useState<CheckpointRow[]>([]);
	const [duration, setDuration] = useState(0);
	const [capturedTime, setCapturedTime] = useState<number | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	const playerRef = useRef<YouTubePlayer | null>(null);

	async function refreshCheckpoints() {
		setCheckpoints(await getAllLessonCheckpoints(lessonId));
	}

	useEffect(() => {
		let cancelled = false;
		Promise.all([getLessonForTeacher(lessonId), getAllLessonCheckpoints(lessonId)])
			.then(([doc, rows]) => {
				if (cancelled) return;
				setLesson(doc);
				setCheckpoints(rows);
			})
			.catch(() => {
				if (!cancelled) setLoadError("Could not load this lesson. Please try again.");
			});
		return () => {
			cancelled = true;
		};
	}, [lessonId]);

	useEffect(() => {
		if (!lesson) return;
		let destroyed = false;
		loadYouTubeApi().then(() => {
			if (destroyed) return;
			const videoId = extractYouTubeId(lesson.youtube);
			playerRef.current = createPlayer(PLAYER_ELEMENT_ID, videoId, {
				onReady: (event) => setDuration(event.target.getDuration()),
			});
		});
		return () => {
			destroyed = true;
			playerRef.current?.destroy();
		};
	}, [lesson]);

	function handleCaptureTimestamp() {
		if (!playerRef.current) return;
		playerRef.current.pauseVideo();
		setCapturedTime(playerRef.current.getCurrentTime());
	}

	async function handleSubmitForReview() {
		const newStatus = await submitLessonForReview(lessonId);
		setStatus(newStatus);
	}

	if (loadError) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{loadError}</div>;
	}
	if (!lesson) {
		return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;
	}

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold text-green-900">{lesson.title}</h1>
				<button
					onClick={handleSubmitForReview}
					disabled={lesson.review_status !== "Draft" && lesson.review_status !== "Rejected"}
					className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
				>
					Submit for review
				</button>
			</div>
			{status && <p className="text-sm text-green-700">Status: {status}</p>}

			<div className="bg-black aspect-video rounded overflow-hidden">
				<div id={PLAYER_ELEMENT_ID} className="w-full h-full" />
			</div>

			{duration > 0 && (
				<div className="relative h-6 bg-gray-200 rounded">
					{checkpoints.map((c) => (
						<div
							key={c.name}
							title={`${c.label} @ ${formatTime(c.timestamp_seconds)}`}
							className="absolute top-0 w-1.5 h-6 bg-green-700 rounded"
							style={{ left: `${(c.timestamp_seconds / duration) * 100}%` }}
						/>
					))}
				</div>
			)}

			<button
				onClick={handleCaptureTimestamp}
				className="border border-green-700 text-green-700 rounded px-4 py-2 text-sm"
			>
				Pause here &amp; add quiz checkpoint
			</button>

			{capturedTime !== null && (
				<CheckpointForm
					lessonId={lessonId}
					timestampSeconds={capturedTime}
					onSaved={async () => {
						setCapturedTime(null);
						await refreshCheckpoints();
						playerRef.current?.playVideo();
					}}
					onCancel={() => {
						setCapturedTime(null);
						playerRef.current?.playVideo();
					}}
				/>
			)}

			<div className="space-y-2">
				<h2 className="font-semibold text-green-800 text-sm">Checkpoints</h2>
				{checkpoints.length === 0 && (
					<p className="text-sm text-gray-500">No checkpoints yet.</p>
				)}
				<ul className="space-y-2">
					{checkpoints.map((c) => (
						<CheckpointRow
							key={c.name}
							checkpointName={c.name}
							timestampSeconds={c.timestamp_seconds}
							questionText={c.question_text}
							onChanged={refreshCheckpoints}
							onSeek={(seconds) => playerRef.current?.seekTo(seconds, true)}
						/>
					))}
				</ul>
			</div>
		</div>
	);
}

function CheckpointRow({
	checkpointName,
	timestampSeconds,
	questionText,
	onChanged,
	onSeek,
}: {
	checkpointName: string;
	timestampSeconds: number;
	questionText: string;
	onChanged: () => Promise<void>;
	onSeek: (seconds: number) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const [detail, setDetail] = useState<CheckpointDetail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function loadDetail() {
		setDetail(await getCheckpointDetail(checkpointName));
	}

	async function handleToggle() {
		const next = !expanded;
		setExpanded(next);
		if (next && !detail) await loadDetail();
	}

	async function handleDelete() {
		setBusy(true);
		setError(null);
		try {
			await deleteCheckpoint(checkpointName);
			await onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not delete this checkpoint.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<li className="border border-green-100 rounded p-2 bg-white">
			<div className="flex items-center gap-2 text-sm">
				<button
					onClick={() => onSeek(timestampSeconds)}
					className="text-gray-500 w-14 text-left hover:text-green-700 hover:underline shrink-0"
					title="Jump to this point in the video"
				>
					{formatTime(timestampSeconds)}
				</button>
				<span className="flex-1">{questionText}</span>
				<button onClick={handleToggle} className="text-green-700 text-xs underline shrink-0">
					{expanded ? "Close" : "Edit"}
				</button>
				<button
					onClick={handleDelete}
					disabled={busy}
					className="text-red-600 text-xs underline shrink-0 disabled:opacity-50"
				>
					Delete
				</button>
			</div>
			{error && <p className="text-xs text-red-600 mt-1">{error}</p>}
			{expanded && detail && (
				<CheckpointEditor
					detail={detail}
					onSaved={async () => {
						await loadDetail();
						await onChanged();
					}}
				/>
			)}
		</li>
	);
}

function CheckpointEditor({
	detail,
	onSaved,
}: {
	detail: CheckpointDetail;
	onSaved: () => Promise<void>;
}) {
	const [questionText, setQuestionText] = useState(detail.question_text);
	const [options, setOptions] = useState(detail.options.map((o) => o.option_text));
	const [correctIndex, setCorrectIndex] = useState(
		detail.options.findIndex((o) => o.is_correct) >= 0
			? detail.options.findIndex((o) => o.is_correct)
			: 0,
	);
	const [saving, setSaving] = useState(false);

	async function handleSave() {
		setSaving(true);
		try {
			await updateCheckpoint(detail.name, {
				question_text: questionText,
				options: options
					.filter((o) => o.trim())
					.map((option_text, i) => ({ option_text, is_correct: i === correctIndex })),
			});
			await onSaved();
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="mt-3 border-t pt-3 space-y-3">
			<textarea
				value={questionText}
				onChange={(e) => setQuestionText(e.target.value)}
				className="w-full border rounded px-2 py-1.5 text-sm"
			/>
			{options.map((option, i) => (
				<div key={i} className="flex items-center gap-2">
					<input
						type="radio"
						name={`correct-${detail.name}`}
						checked={correctIndex === i}
						onChange={() => setCorrectIndex(i)}
					/>
					<input
						value={option}
						onChange={(e) => {
							const next = [...options];
							next[i] = e.target.value;
							setOptions(next);
						}}
						className="flex-1 border rounded px-2 py-1.5 text-sm"
					/>
				</div>
			))}
			<button
				onClick={handleSave}
				disabled={saving}
				className="bg-green-700 text-white rounded px-3 py-1.5 text-xs disabled:opacity-50"
			>
				{saving ? "Saving..." : "Save changes"}
			</button>

			<TranslationEditor detail={detail} onSaved={onSaved} />
		</div>
	);
}

function TranslationEditor({
	detail,
	onSaved,
}: {
	detail: CheckpointDetail;
	onSaved: () => Promise<void>;
}) {
	const [languages, setLanguages] = useState<{ name: string; language_name: string }[]>([]);
	const [language, setLanguage] = useState("");
	const [questionText, setQuestionText] = useState("");
	const [options, setOptions] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getAvailableLanguages()
			.then((rows) => {
				if (!cancelled) setLanguages(rows);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	function selectLanguage(value: string) {
		setLanguage(value);
		setError(null);
		const existing = detail.translations.find((t) => t.language === value);
		if (existing) {
			setQuestionText(existing.question_text);
			setOptions(existing.options.map((o) => o.option_text));
		} else {
			setQuestionText("");
			setOptions(detail.options.map(() => ""));
		}
	}

	async function handleSave() {
		setSaving(true);
		setError(null);
		try {
			await saveCheckpointTranslation(detail.name, language, questionText, options);
			await onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not save the translation.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="border-t pt-3 space-y-2">
			<p className="text-xs font-medium text-green-800">Translations</p>
			<p className="text-xs text-gray-500">
				Translate the question and options. Keep the same order — option 1 here must mean the
				same thing as option 1 above, since correctness is taken from the original.
			</p>
			{detail.translations.length > 0 && (
				<p className="text-xs text-gray-500">
					Existing: {detail.translations.map((t) => t.language).join(", ")}
				</p>
			)}
			<select
				value={language}
				onChange={(e) => selectLanguage(e.target.value)}
				className="border rounded px-2 py-1.5 text-sm"
			>
				<option value="">Select a language...</option>
				{languages.map((l) => (
					<option key={l.name} value={l.name}>
						{l.language_name}
					</option>
				))}
			</select>
			{language && (
				<>
					<textarea
						value={questionText}
						onChange={(e) => setQuestionText(e.target.value)}
						placeholder="Translated question"
						className="w-full border rounded px-2 py-1.5 text-sm"
					/>
					{options.map((option, i) => (
						<input
							key={i}
							value={option}
							onChange={(e) => {
								const next = [...options];
								next[i] = e.target.value;
								setOptions(next);
							}}
							placeholder={`Translated option ${i + 1} (original: ${detail.options[i]?.option_text ?? ""})`}
							className="w-full border rounded px-2 py-1.5 text-sm"
						/>
					))}
					{error && <p className="text-xs text-red-600">{error}</p>}
					<button
						onClick={handleSave}
						disabled={saving}
						className="bg-green-700 text-white rounded px-3 py-1.5 text-xs disabled:opacity-50"
					>
						{saving ? "Saving..." : "Save translation"}
					</button>
				</>
			)}
		</div>
	);
}

function CheckpointForm({
	lessonId,
	timestampSeconds,
	onSaved,
	onCancel,
}: {
	lessonId: string;
	timestampSeconds: number;
	onSaved: () => void;
	onCancel: () => void;
}) {
	const [label, setLabel] = useState("");
	const [question, setQuestion] = useState("");
	const [options, setOptions] = useState(["", ""]);
	const [correctIndex, setCorrectIndex] = useState(0);
	const [saving, setSaving] = useState(false);

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			await createCheckpoint(
				lessonId,
				timestampSeconds,
				label || `Checkpoint @ ${formatTime(timestampSeconds)}`,
				question,
				options
					.filter((o) => o.trim())
					.map((option_text, i) => ({ option_text, is_correct: i === correctIndex })),
			);
			onSaved();
		} finally {
			setSaving(false);
		}
	}

	return (
		<form
			onSubmit={handleSave}
			className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3"
		>
			<p className="text-sm text-gray-600">
				Adding a checkpoint at <strong>{formatTime(timestampSeconds)}</strong>
			</p>
			<input
				value={label}
				onChange={(e) => setLabel(e.target.value)}
				placeholder="Label (optional)"
				className="w-full border rounded px-3 py-2 text-sm"
			/>
			<textarea
				value={question}
				onChange={(e) => setQuestion(e.target.value)}
				placeholder="Question text"
				className="w-full border rounded px-3 py-2 text-sm"
				required
			/>
			{options.map((option, i) => (
				<div key={i} className="flex items-center gap-2">
					<input
						type="radio"
						name="correct-option"
						checked={correctIndex === i}
						onChange={() => setCorrectIndex(i)}
					/>
					<input
						value={option}
						onChange={(e) => {
							const next = [...options];
							next[i] = e.target.value;
							setOptions(next);
						}}
						placeholder={`Option ${i + 1}`}
						className="flex-1 border rounded px-3 py-2 text-sm"
						required
					/>
				</div>
			))}
			<button
				type="button"
				onClick={() => setOptions([...options, ""])}
				className="text-sm text-green-700 underline"
			>
				+ Add option
			</button>
			<div className="flex gap-2">
				<button
					type="submit"
					disabled={saving}
					className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
				>
					{saving ? "Saving..." : "Save checkpoint"}
				</button>
				<button type="button" onClick={onCancel} className="text-sm text-gray-500">
					Cancel
				</button>
			</div>
		</form>
	);
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}
