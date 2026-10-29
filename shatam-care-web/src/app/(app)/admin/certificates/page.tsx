"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { FRAPPE_URL } from "@/lib/frappe-client";
import {
	CertificateSettings,
	fetchCertificatePreview,
	getCertificateSettings,
	resetCertificateBackground,
	updateCertificateText,
	uploadCertificateBackground,
} from "@/lib/lms-api";

function describeError(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

// Quick feedback before uploading anything. The server repeats these checks, so
// this only saves a round trip; it is not the safeguard.
function readImageSize(file: File): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve({ width: image.naturalWidth, height: image.naturalHeight });
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("This file is not a valid image. Please upload a PNG or JPG."));
		};
		image.src = url;
	});
}

export default function AdminCertificateTemplatePage() {
	const { user } = useAuth();
	const [settings, setSettings] = useState<CertificateSettings | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [file, setFile] = useState<File | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [resetting, setResetting] = useState(false);
	const [previewing, setPreviewing] = useState(false);
	const [imageMessage, setImageMessage] = useState<{ ok: boolean; text: string } | null>(null);

	const [title, setTitle] = useState("");
	const [signatoryName, setSignatoryName] = useState("");
	const [signatoryTitle, setSignatoryTitle] = useState("");
	const [savingText, setSavingText] = useState(false);
	const [textMessage, setTextMessage] = useState<{ ok: boolean; text: string } | null>(null);

	function applySettings(next: CertificateSettings) {
		setSettings(next);
		setTitle(next.certificate_title);
		setSignatoryName(next.signatory_name);
		setSignatoryTitle(next.signatory_title);
	}

	useEffect(() => {
		if (!user?.isAdmin) return;
		let cancelled = false;
		getCertificateSettings()
			.then((result) => {
				if (!cancelled) applySettings(result);
			})
			.catch(() => {
				if (!cancelled) setLoadError("Could not load the certificate settings.");
			});
		return () => {
			cancelled = true;
		};
	}, [user?.isAdmin]);

	if (!user?.isAdmin) {
		return (
			<div className="max-w-3xl mx-auto px-6 py-10 text-gray-600">
				Only administrators can change the certificate template.
			</div>
		);
	}
	if (loadError) return <div className="max-w-3xl mx-auto px-6 py-10 text-red-600">{loadError}</div>;
	if (!settings) return <div className="max-w-3xl mx-auto px-6 py-10 text-gray-500">Loading...</div>;

	const { requirements } = settings;
	const backgroundSrc = `${FRAPPE_URL}${settings.using_default ? settings.default_background_url : settings.background_url}`;

	async function handleUpload() {
		if (!file) return;
		setImageMessage(null);
		setUploading(true);
		try {
			const { width, height } = await readImageSize(file);
			const wantedRatio = requirements.width_px / requirements.height_px;
			if (Math.abs(width / height - wantedRatio) / wantedRatio > 0.02) {
				throw new Error(
					`The image is ${width} x ${height} px. It must be A4 landscape, the shape of ${requirements.width_px} x ${requirements.height_px} px.`,
				);
			}
			if (width < requirements.min_width_px) {
				throw new Error(
					`The image is too small (${width} px wide). Use at least ${requirements.min_width_px} px, ideally ${requirements.width_px} px.`,
				);
			}
			if (file.size > requirements.max_mb * 1024 * 1024) {
				throw new Error(`The image is larger than ${requirements.max_mb} MB.`);
			}
			applySettings(await uploadCertificateBackground(file));
			setFile(null);
			if (fileInput.current) fileInput.current.value = "";
			setImageMessage({ ok: true, text: "New background applied. All certificates now use it." });
		} catch (error) {
			setImageMessage({ ok: false, text: describeError(error, "Could not upload the image.") });
		} finally {
			setUploading(false);
		}
	}

	async function handleReset() {
		if (!window.confirm("Go back to the built-in design? Every certificate will switch to it.")) return;
		setImageMessage(null);
		setResetting(true);
		try {
			applySettings(await resetCertificateBackground());
			setImageMessage({ ok: true, text: "Back to the built-in design." });
		} catch (error) {
			setImageMessage({ ok: false, text: describeError(error, "Could not reset the background.") });
		} finally {
			setResetting(false);
		}
	}

	async function handlePreview() {
		setImageMessage(null);
		setPreviewing(true);
		// Opened before the request: browsers only allow a new tab straight after
		// a click, and building the PDF can take a few seconds.
		const tab = window.open("", "_blank");
		try {
			const blob = await fetchCertificatePreview();
			const url = URL.createObjectURL(blob);
			if (tab) tab.location.href = url;
			else window.location.href = url;
		} catch (error) {
			tab?.close();
			setImageMessage({ ok: false, text: describeError(error, "Could not build the preview.") });
		} finally {
			setPreviewing(false);
		}
	}

	async function handleSaveText(e: React.FormEvent) {
		e.preventDefault();
		setTextMessage(null);
		setSavingText(true);
		try {
			applySettings(
				await updateCertificateText({
					certificate_title: title,
					signatory_name: signatoryName,
					signatory_title: signatoryTitle,
				}),
			);
			setTextMessage({ ok: true, text: "Saved. All certificates now show this text." });
		} catch (error) {
			setTextMessage({ ok: false, text: describeError(error, "Could not save.") });
		} finally {
			setSavingText(false);
		}
	}

	return (
		<div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold text-green-900">Certificate template</h1>
				<p className="text-sm text-gray-500 mt-1">
					Changes apply to every certificate, including ones already issued. Each learner&apos;s name,
					course, date, QR code and ID are printed on top of the background automatically.
				</p>
			</div>

			<section className="bg-white rounded-lg border border-green-100 p-4 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="font-medium text-green-800">Background image</h2>
					<span className="text-xs text-gray-500">
						{settings.using_default ? "Using the built-in design" : "Using your uploaded image"}
					</span>
				</div>

				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={backgroundSrc}
					alt="Current certificate background"
					className="w-full rounded border border-gray-200 bg-gray-50 aspect-[297/210] object-contain"
				/>

				<div className="text-sm text-gray-600">
					A4 landscape PNG or JPG, ideally {requirements.width_px} x {requirements.height_px} px
					(at least {requirements.min_width_px} px wide), up to {requirements.max_mb} MB. Leave the
					centre empty: the learner&apos;s details are printed there.
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<input
						ref={fileInput}
						type="file"
						accept="image/png,image/jpeg"
						onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						className="text-sm"
					/>
					<button
						onClick={handleUpload}
						disabled={!file || uploading}
						className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{uploading ? "Uploading..." : "Upload and apply"}
					</button>
					<button
						onClick={handlePreview}
						disabled={previewing}
						className="border border-green-700 text-green-800 rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{previewing ? "Building..." : "Preview PDF"}
					</button>
					{!settings.using_default && (
						<button
							onClick={handleReset}
							disabled={resetting}
							className="text-sm text-red-700 underline disabled:opacity-50"
						>
							{resetting ? "Resetting..." : "Use built-in design"}
						</button>
					)}
				</div>
				{imageMessage && (
					<p className={`text-sm ${imageMessage.ok ? "text-green-700" : "text-red-600"}`}>
						{imageMessage.text}
					</p>
				)}
			</section>

			<form
				onSubmit={handleSaveText}
				className="bg-white rounded-lg border border-green-100 p-4 space-y-3"
			>
				<h2 className="font-medium text-green-800">Text on the certificate</h2>
				<label className="block text-sm">
					<span className="text-gray-600">Title</span>
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Certificate of Completion"
						maxLength={140}
						className="mt-1 w-full border rounded px-3 py-2 text-sm"
					/>
				</label>
				<div className="grid sm:grid-cols-2 gap-3">
					<label className="block text-sm">
						<span className="text-gray-600">Signatory name</span>
						<input
							value={signatoryName}
							onChange={(e) => setSignatoryName(e.target.value)}
							placeholder="Leave empty to print the course evaluator"
							maxLength={140}
							className="mt-1 w-full border rounded px-3 py-2 text-sm"
						/>
					</label>
					<label className="block text-sm">
						<span className="text-gray-600">Signatory title</span>
						<input
							value={signatoryTitle}
							onChange={(e) => setSignatoryTitle(e.target.value)}
							placeholder="e.g. Programme Director"
							maxLength={140}
							className="mt-1 w-full border rounded px-3 py-2 text-sm"
						/>
					</label>
				</div>
				<div className="flex items-center gap-3">
					<button
						type="submit"
						disabled={savingText}
						className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
					>
						{savingText ? "Saving..." : "Save text"}
					</button>
					{textMessage && (
						<span className={`text-sm ${textMessage.ok ? "text-green-700" : "text-red-600"}`}>
							{textMessage.text}
						</span>
					)}
				</div>
			</form>
		</div>
	);
}
