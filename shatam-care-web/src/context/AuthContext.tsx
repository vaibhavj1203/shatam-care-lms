"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Capability, login as loginRequest } from "@/lib/frappe-client";
import { getServerSnapshot, getSnapshot, subscribe, setToken, clearToken } from "@/lib/auth-store";
import { getMyLearnerState } from "@/lib/lms-api";

type AuthContextValue = {
	user: ReturnType<typeof getSnapshot>;
	// True once the client has mounted and useSyncExternalStore has resolved
	// its real (non-SSR-placeholder) value — route guards must wait for this
	// before deciding to redirect, otherwise the SSR-matching first render
	// (which always sees user=null) triggers a false redirect to /login even
	// for an already-logged-in visitor. See git history for the empirical
	// repro that caught this.
	ready: boolean;
	login: (usr: string, pwd: string) => Promise<void>;
	logout: () => void;
	hasRole: (role: string) => boolean;
	/** Capability check — this is what gates navigation and actions. */
	can: (capability: Capability) => boolean;
	/**
	 * Whether to show the learner UI (Courses / Certificates).
	 *
	 * Deliberately not `hasRole("LMS Student")`: Frappe's built-in
	 * Administrator holds every role, so that gave it a learner dashboard it
	 * had no use for. The backend decides — students always qualify, admins
	 * only once they actually have enrolments or certificates.
	 * Null while still loading, so nav doesn't flicker.
	 */
	isLearner: boolean | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const [ready, setReady] = useState(false);
	const router = useRouter();

	// Intentional client-mount signal, not a read from an external
	// synchronized store (that's what useSyncExternalStore above is for) —
	// this just tells consumers "the hydration-matching first render has
	// passed," which route guards need to avoid a false redirect (see the
	// `ready` doc comment above).
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setReady(true);
	}, []);

	// Fetched rather than baked into the token: an admin who enrols to preview
	// a course should get the learner UI without signing out and back in.
	// Stored against the user it was fetched for, then derived below. Resetting
	// it synchronously on sign-out would both trip the cascading-render rule and
	// briefly show the previous account's learner state after switching users.
	const [learnerState, setLearnerState] = useState<{
		forUser: string;
		isLearner: boolean;
	} | null>(null);

	useEffect(() => {
		if (!user) return;
		let cancelled = false;
		const forUser = user.user;
		const hasStudentRole = user.roles.includes("LMS Student");
		getMyLearnerState()
			.then((state) => {
				if (!cancelled) setLearnerState({ forUser, isLearner: state.is_learner });
			})
			.catch(() => {
				// Fail OPEN, to the role. This only decides whether to show the
				// learner nav; defaulting to false on a transient error would
				// strip Courses and Certificates from a student and leave them
				// with nowhere to go. The worst case of failing open is that
				// Administrator briefly sees learner links it doesn't need.
				if (!cancelled) {
					setLearnerState({ forUser, isLearner: hasStudentRole });
				}
			});
		return () => {
			cancelled = true;
		};
	}, [user]);

	// null until this user's own answer has arrived, so nav never flickers or
	// shows a stale one.
	const isLearner =
		user && learnerState?.forUser === user.user ? learnerState.isLearner : null;

	async function login(usr: string, pwd: string) {
		const token = await loginRequest(usr, pwd);
		setToken(token);
	}

	function logout() {
		clearToken();
		router.push("/login");
	}

	function hasRole(role: string) {
		return user?.roles.includes(role) ?? false;
	}

	function can(capability: Capability) {
		return user?.capabilities?.includes(capability) ?? false;
	}

	return (
		<AuthContext.Provider value={{ user, ready, login, logout, hasRole, can, isLearner }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth must be used within AuthProvider");
	return context;
}
