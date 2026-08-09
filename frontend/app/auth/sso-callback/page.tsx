"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, AlertTriangle } from "lucide-react";

export default function SsoCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Missing SSO code.");
      return;
    }

    signIn("sso", { code, redirect: false }).then((res) => {
      if (res?.ok) {
        router.push("/dashboard");
      } else {
        setError("SSO sign-in failed. The link may have expired — try signing in again.");
      }
    });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      {error ? (
        <div className="text-center space-y-3 max-w-sm px-4">
          <AlertTriangle size={32} className="mx-auto text-red-500" />
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{error}</p>
          <button onClick={() => router.push("/auth")} className="text-sm text-indigo-500 hover:underline">
            Back to sign in
          </button>
        </div>
      ) : (
        <div className="text-center space-y-3">
          <Loader2 size={28} className="mx-auto animate-spin text-indigo-500" />
          <p className="text-sm text-zinc-500">Signing you in…</p>
        </div>
      )}
    </div>
  );
}
