"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { ShieldCheck, Zap, Globe2 } from "lucide-react";

type Errors = {
  name?: string;
  email?: string;
  password?: string;
  otp?: string;
};

type Banner =
  | { type: "error"; message: string }
  | { type: "success"; message: string }
  | null;

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [mode, setMode] = useState<"login" | "signup" | "otp">("login");
  const [animating, setAnimating] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [loading, setLoading] = useState(false);

  const [showResend, setShowResend] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Auto-redirect authenticated users
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function switchMode(next: "login" | "signup" | "otp") {
    setAnimating(true);
    setTimeout(() => {
      setMode(next);
      setErrors({});
      setBanner(null);
      setAnimating(false);
    }, 200);
  }

  function parseZodError(error: unknown): Errors {
    const result: Errors = {};
    if (typeof error === "string") {
      setBanner({ type: "error", message: error });
      return result;
    }
    const errObj = error as Record<string, { _errors?: string[] }>;
    for (const key in errObj) {
      if (errObj[key]?._errors?.length) {
        result[key as keyof Errors] = errObj[key]._errors[0];
      }
    }
    return result;
  }

  async function handleSignup() {
    setLoading(true);
    setErrors({});
    setBanner(null);

    const res = await fetch("http://localhost:9000/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErrors(parseZodError(data.error));
      setLoading(false);
      return;
    }

    setBanner({
      type: "success",
      message: "Check your email for the verification code.",
    });

    setLoading(false);
    switchMode("otp");
  }

  async function handleVerifyOTP() {
    setLoading(true);
    setErrors({});
    setBanner(null);

    try {
      const res = await api.post("/auth/verify-otp", { email, otp });
      setBanner({ type: "success", message: "Email verified successfully! You can now log in." });
      setMode("login");
      setPassword("");
    } catch (err: any) {
      setErrors({ otp: err.response?.data?.error || "Invalid OTP" });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setLoading(true);
    setErrors({});
    setBanner(null);
    setShowResend(false);

    // If this email's domain has SAML SSO configured, redirect to the IdP
    // instead of attempting a password login.
    try {
      const ssoRes = await api.get("/auth/sso/check", { params: { email } });
      if (ssoRes.data?.ssoUrl) {
        window.location.href = ssoRes.data.ssoUrl;
        return;
      }
    } catch {
      // SSO check failing shouldn't block a normal password login
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.ok) {
      router.push("/dashboard");
    } else {
      setBanner({
        type: "error",
        message: "Invalid credentials or email not verified.",
      });
      setShowResend(true);
    }
  }

  async function resendVerification() {
    if (resendCooldown > 0) return;
    await api.post("/auth/resend-verification", { email });
    setBanner({ type: "success", message: "Verification email sent again." });
    setResendCooldown(30);
  }

  if (status === "loading" || status === "authenticated") {
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" />;
  }

  return (
    <div className="min-h-screen flex w-full bg-white dark:bg-[#0a0a0a]">
      {/* Left Panel - Premium Brand Showcase */}
      <div className="hidden lg:flex flex-1 relative flex-col justify-between overflow-hidden bg-zinc-50 dark:bg-zinc-900/30 border-r border-zinc-200 dark:border-white/5 px-12 py-16">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay pointer-events-none" />
        <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-indigo-500/20 blur-[120px] mix-blend-normal opacity-50" />
        <div className="absolute bottom-[-20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-purple-500/20 blur-[120px] mix-blend-normal opacity-50" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-bold shadow-md">
            D
          </div>
          <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Deployr</span>
        </div>

        <div className="relative z-10 mt-20 mb-auto">
          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white leading-[1.1]">
            Deploy with absolute confidence.
          </h1>
          <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400 max-w-md leading-relaxed">
            Join the elite teams building the future on our distributed edge caching network. 
            Scale globally in milliseconds.
          </p>

          <div className="mt-12 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm">
                <Globe2 size={18} className="text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-zinc-900 dark:text-white">Global Edge Network</span>
                <span className="text-sm text-zinc-500">250+ POPs worldwide</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm">
                <ShieldCheck size={18} className="text-emerald-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-zinc-900 dark:text-white">AES-256 Vault</span>
                <span className="text-sm text-zinc-500">Military-grade secret encryption</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm">
                <Zap size={18} className="text-yellow-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-zinc-900 dark:text-white">Instant Rollbacks</span>
                <span className="text-sm text-zinc-500">Zero-downtime atomic deploys</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-sm text-zinc-500">
          © {new Date().getFullYear()} Deployr Inc. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 relative">
        <div className="w-full max-w-[400px]">
          
          <div className="lg:hidden flex items-center justify-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-bold shadow-md">
              D
            </div>
            <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Deployr</span>
          </div>

          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              {mode === "login" && "Welcome back"}
              {mode === "signup" && "Create an account"}
              {mode === "otp" && "Verify your email"}
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm md:text-base">
              {mode === "login" && "Enter your credentials to access your dashboard"}
              {mode === "signup" && "Get started with your free Deployr account"}
              {mode === "otp" && "We've sent a 6-digit code to your email"}
            </p>
          </div>

          {banner && (
            <div
              className={`mb-6 rounded-xl px-4 py-3 text-sm flex items-center gap-3 border ${
                banner.type === "error"
                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400"
                  : "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-400"
              }`}
            >
              {banner.message}
            </div>
          )}

          <div
            className={`transition-all duration-300 transform ${
              animating ? "opacity-0 scale-95" : "opacity-100 scale-100"
            }`}
          >
            {/* OAuth Buttons */}
            {mode !== "otp" && (
              <div className="flex flex-col gap-3 mb-6">
                <Button 
                  variant="outline" 
                  className="w-full py-5 rounded-xl border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition shadow-sm font-medium"
                  onClick={() => signIn("github", { callbackUrl: "/" })}
                >
                  <Image src="/github.svg" alt="GitHub" width={18} height={18} className="mr-2 dark:invert" />
                  Continue with GitHub
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full py-5 rounded-xl border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition shadow-sm font-medium"
                  onClick={() => signIn("google", { callbackUrl: "/" })}
                >
                  <Image src="/google.svg" alt="Google" width={18} height={18} className="mr-2" />
                  Continue with Google
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wider">
                    <span className="bg-white dark:bg-[#0a0a0a] px-3 text-zinc-500">Or continue with email</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Full Name</label>
                  <Input
                    placeholder="John Doe"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="py-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
                    autoComplete="off"
                  />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </div>
              )}

              {mode !== "otp" && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Email Address</label>
                    <Input
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="py-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                    />
                    {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Password</label>
                      {mode === "login" && (
                        <Link href="/auth/forgot-password" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                          Forgot password?
                        </Link>
                      )}
                    </div>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="py-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
                      autoComplete="new-password"
                    />
                    {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                  </div>
                </>
              )}

              {mode === "otp" && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">6-Digit Code</label>
                  <Input
                    placeholder="123456"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    className="py-6 rounded-xl bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500 text-center tracking-[0.5em] font-mono text-lg"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                  {errors.otp && <p className="text-xs text-red-500 text-center">{errors.otp}</p>}
                </div>
              )}

              <Button
                className="w-full py-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-md transition-all shadow-md mt-4"
                disabled={loading}
                onClick={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleVerifyOTP}
              >
                {loading ? "Processing..." : mode === "login" ? "Sign in" : mode === "signup" ? "Create Account" : "Verify Code"}
              </Button>

              {mode === "login" && showResend && (
                <button
                  disabled={resendCooldown > 0}
                  onClick={resendVerification}
                  className="block w-full text-center text-sm text-indigo-600 dark:text-indigo-400 mt-4 hover:underline disabled:opacity-50"
                >
                  {resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : "Resend verification email"}
                </button>
              )}
            </div>

            <div className="mt-8 text-center">
              {mode === "login" ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Don't have an account?{" "}
                  <button onClick={() => switchMode("signup")} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                    Sign up
                  </button>
                </p>
              ) : mode === "signup" ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Already have an account?{" "}
                  <button onClick={() => switchMode("login")} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                    Log in
                  </button>
                </p>
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Entered wrong email?{" "}
                  <button onClick={() => switchMode("signup")} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                    Go back
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-[#0a0a0a]" />}>
      <AuthPageContent />
    </Suspense>
  );
}
