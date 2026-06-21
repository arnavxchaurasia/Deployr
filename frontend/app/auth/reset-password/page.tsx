"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "form" | "success" | "error";

function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("form");
  const [loading, setLoading] = useState(false);

  // ❌ Invalid / missing token
  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Invalid or expired password reset link.");
    }
  }, [token]);

  async function submit() {
    if (!password) {
      setError("Please enter a new password.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await api.post("/auth/reset-password", {
        token,
        password,
      });

      setStatus("success");
    } catch (err) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(
        axiosError?.response?.data?.error || "Failed to reset password."
      );
    } finally {
      setLoading(false);
    }
  }

  // ⏳ Auto redirect after success
  useEffect(() => {
    if (status === "success") {
      const t = setTimeout(() => {
        router.push("/auth");
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
      <div
        className={`w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 space-y-6 shadow-xl
        transition-all duration-300 animate-[fadeIn_0.4s_ease-out]`}
      >
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="text-sm text-zinc-500">
            Choose a strong new password for your account
          </p>
        </div>

        {/* FORM */}
        {status === "form" && (
          <div className="space-y-4 animate-[fadeIn_0.3s_ease-out]">
            <div>
              <Input
                type="password"
                placeholder="New password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                className="focus:ring-2 focus:ring-black/10"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Minimum 8 characters, with uppercase, number & symbol
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 animate-[shake_0.3s_ease-in-out]">
                {error}
              </p>
            )}

            <Button
              className="w-full rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0"
              disabled={loading}
              onClick={submit}
            >
              {loading ? "Updating…" : "Update password"}
            </Button>
          </div>
        )}

        {/* SUCCESS */}
        {status === "success" && (
          <div className="text-center space-y-3 animate-[fadeIn_0.3s_ease-out]">
            <p className="text-green-600 font-medium text-lg">
              Password updated 🎉
            </p>
            <p className="text-sm text-zinc-500">
              You’ll be redirected to login shortly.
            </p>

            <Button
              className="w-full rounded-xl"
              onClick={() => router.push("/auth")}
            >
              Go to login now
            </Button>
          </div>
        )}

        {/* ERROR */}
        {status === "error" && (
          <div className="text-center space-y-3 animate-[fadeIn_0.3s_ease-out]">
            <p className="text-red-600 font-medium text-lg">
              Reset failed
            </p>
            <p className="text-sm text-zinc-500">
              {error}
            </p>

            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => router.push("/auth")}
            >
              Back to login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">Loading...</div>}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
