"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
	const { user, ready } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (!ready) return;
		router.replace(user ? "/dashboard" : "/login");
	}, [ready, user, router]);

	return null;
}
