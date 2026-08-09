// Frappe document names routinely contain spaces and colons (e.g.
// "0027 Lesson 1: Safe Lifting"), so they must be percent-encoded into URLs.
// This Next.js version hands dynamic route segments back still-encoded, so a
// param used directly as a doc name silently misses every lookup — the API
// returns "not found" for a record that plainly exists.
//
// decodeURIComponent is safe to apply even if a future version starts decoding
// for us: an already-decoded name contains no percent-escapes to re-decode.
export function decodeParam(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		// Malformed escape sequence — use it as-is rather than throwing.
		return value;
	}
}
