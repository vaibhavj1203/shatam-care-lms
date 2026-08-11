"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Capability, login as loginRequest } from "@/lib/frappe-client";
import { getServerSnapshot, getSnapshot, subscribe, setToken, clearToken } from "@/lib/auth-store";

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
		<AuthContext.Provider value={{ user, ready, login, logout, hasRole, can }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth must be used within AuthProvider");
	return context;
}
