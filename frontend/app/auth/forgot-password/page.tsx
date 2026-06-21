"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  async function submit() {
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await api.post("/auth/request-password-reset", { email });
      setDone(true);
      setCooldown(30);
    } catch {
      setError("Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  // ⏱ cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
      <div
        className={`w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 space-y-6 shadow-xl
        transition-all duration-300 ${
          done ? "scale-[1.01]" : "scale-100"
        } animate-[fadeIn_0.4s_ease-out]`}
      >
        {!done ? (
          <>
            {/* Header */}
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-semibold">Forgot your password?</h1>
              <p className="text-sm text-zinc-500">
                No worries — we’ll send you a reset link.
              </p>
            </div>

            {/* Input */}
            <div className="space-y-3">
              <Input
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                className="focus:ring-2 focus:ring-black/10"
              />

              {error && (
                <p className="text-sm text-red-600 animate-[shake_0.3s_ease-in-out]">
                  {error}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Button
                onClick={submit}
                disabled={loading}
                className="w-full rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                {loading ? "Sending…" : "Send reset link"}
              </Button>

              <Button
                variant="ghost"
                className="w-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => router.push("/auth")}
              >
                Back to login
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Success */}
            <div className="text-center space-y-2 animate-[fadeIn_0.3s_ease-out]">
              <h1 className="text-2xl font-semibold">Check your email</h1>
              <p className="text-sm text-zinc-500">
                If the email exists, a password reset link has been sent.
              </p>
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                disabled={cooldown > 0}
                onClick={submit}
                className="w-full rounded-xl"
              >
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : "Resend reset link"}
              </Button>

              <Button
                variant="ghost"
                className="w-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => router.push("/auth")}
              >
                Back to login
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
