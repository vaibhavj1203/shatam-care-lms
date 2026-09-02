// Thin client for talking to the Frappe backend over its REST/RPC API using
// token auth (api_key:api_secret), not session cookies — see
// ../../PLAN.md section 5 and shatam_care/shatam_care/auth.py for why.

export const FRAPPE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL ?? "http://lms.localhost:8000";

export type Capability = "courses" | "content" | "review" | "certificates" | "people";

export type AuthToken = {
	apiKey: string;
	apiSecret: string;
	user: string;
	fullName: string;
	roles: string[];
	/** What this user may do. Admins hold every capability implicitly. */
	capabilities: Capability[];
	isAdmin: boolean;
};

const TOKEN_STORAGE_KEY = "shatam_care_auth";

export function saveToken(token: AuthToken) {
	localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
}

export function loadToken(): AuthToken | null {
	if (typeof window === "undefined") return null;
	const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
	return raw ? (JSON.parse(raw) as AuthToken) : null;
}

export function clearToken() {
	localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Pull the human-readable sentence out of a Frappe error response.
 *
 * Frappe does not put it in `message`. It arrives either in `_server_messages`
 * (a JSON string containing an array of JSON strings, each with its own
 * `message`) or at the end of `exception` as "ExceptionType: the message".
 * Without this the UI fell back to `response.statusText` and showed users
 * "EXPECTATION FAILED" instead of "An account already exists for ...".
 */
function extractErrorMessage(body: Record<string, unknown>, fallback: string): string {
	const serverMessages = body._server_messages;
	if (typeof serverMessages === "string") {
		try {
			const parsed: unknown = JSON.parse(serverMessages);
			if (Array.isArray(parsed) && parsed.length) {
				const first = typeof parsed[0] === "string" ? JSON.parse(parsed[0]) : parsed[0];
				const text = (first as { message?: string })?.message;
				if (text) return stripHtml(text);
			}
		} catch {
			// fall through to the other shapes
		}
	}

	const exception = body.exception;
	if (typeof exception === "string" && exception.includes(":")) {
		return stripHtml(exception.slice(exception.indexOf(":") + 1).trim());
	}

	if (typeof body.message === "string" && body.message) return stripHtml(body.message);
	return fallback;
}

// Frappe messages routinely contain markup (<b>, <div class="alert">, <ul>).
function stripHtml(text: string): string {
	return text
		.replace(/<li>/gi, " • ")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

class FrappeApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const token = loadToken();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options.headers as Record<string, string> | undefined),
	};
	if (token) {
		headers["Authorization"] = `token ${token.apiKey}:${token.apiSecret}`;
	}

	const response = await fetch(`${FRAPPE_URL}${path}`, { ...options, headers });
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new FrappeApiError(extractErrorMessage(body, response.statusText), response.status);
	}
	const body = await response.json();
	// Frappe wraps responses differently per endpoint family:
	//   /api/method/*   -> { "message": <payload> }
	//   /api/resource/* -> { "data":    <payload> }
	// Unwrapping only `message` silently returned the `{data: ...}` wrapper for
	// every resource call, so callers got an object where they expected a doc or
	// an array (`rows.map is not a function`). Handle both.
	return (body.message ?? body.data ?? body) as T;
}

export async function login(usr: string, pwd: string): Promise<AuthToken> {
	const result = await request<{
		api_key: string;
		api_secret: string;
		user: string;
		full_name: string;
		roles: string[];
		capabilities: Capability[];
		is_admin: boolean;
	}>("/api/method/shatam_care.shatam_care.auth.login_and_get_token", {
		method: "POST",
		body: JSON.stringify({ usr, pwd }),
	});
	const token: AuthToken = {
		apiKey: result.api_key,
		apiSecret: result.api_secret,
		user: result.user,
		fullName: result.full_name,
		roles: result.roles,
		capabilities: result.capabilities ?? [],
		isAdmin: !!result.is_admin,
	};
	saveToken(token);
	return token;
}

export function callMethod<T>(method: string, params?: Record<string, unknown>): Promise<T> {
	const isWrite = !!params;
	return request<T>(`/api/method/${method}`, {
		method: isWrite ? "POST" : "GET",
		body: isWrite ? JSON.stringify(params) : undefined,
	});
}

export function getDoc<T>(doctype: string, name: string): Promise<T> {
	return request<T>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
}

export function getList<T>(
	doctype: string,
	options: { fields?: string[]; filters?: unknown[]; orderBy?: string; limit?: number } = {},
): Promise<T[]> {
	const params = new URLSearchParams();
	if (options.fields) params.set("fields", JSON.stringify(options.fields));
	if (options.filters) params.set("filters", JSON.stringify(options.filters));
	if (options.orderBy) params.set("order_by", options.orderBy);
	if (options.limit) params.set("limit_page_length", String(options.limit));
	return request<T[]>(`/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`);
}

export function createDoc<T>(doctype: string, data: Record<string, unknown>): Promise<T> {
	return request<T>(`/api/resource/${encodeURIComponent(doctype)}`, {
		method: "POST",
		body: JSON.stringify(data),
	});
}

export function updateDoc<T>(
	doctype: string,
	name: string,
	data: Record<string, unknown>,
): Promise<T> {
	return request<T>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
		method: "PUT",
		body: JSON.stringify(data),
	});
}

export { FrappeApiError };
