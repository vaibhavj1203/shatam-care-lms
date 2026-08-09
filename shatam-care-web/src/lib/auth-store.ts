// Thin external-store wrapper around the localStorage-backed auth token, so
// AuthContext can read it via useSyncExternalStore instead of useEffect +
// setState — avoids both the SSR/hydration mismatch (server has no
// localStorage) and cascading-render lint warnings that come from setting
// state directly inside an effect body.
import { AuthToken, clearToken as clearStoredToken, loadToken, saveToken } from "./frappe-client";

type Listener = () => void;
const listeners = new Set<Listener>();

let cachedRaw: string | null | undefined = undefined;
let cachedToken: AuthToken | null = null;

function readRaw(): string | null {
	return typeof window === "undefined" ? null : localStorage.getItem("shatam_care_auth");
}

export function getSnapshot(): AuthToken | null {
	const raw = readRaw();
	if (raw !== cachedRaw) {
		cachedRaw = raw;
		cachedToken = raw ? loadToken() : null;
	}
	return cachedToken;
}

export function getServerSnapshot(): AuthToken | null {
	return null;
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function setToken(token: AuthToken) {
	saveToken(token);
	listeners.forEach((listener) => listener());
}

export function clearToken() {
	clearStoredToken();
	listeners.forEach((listener) => listener());
}
