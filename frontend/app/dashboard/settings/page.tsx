"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import Image from "next/image";
import { 
  User, 
  Mail, 
  Github, 
  Briefcase, 
  Building, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Camera, 
  Loader2,
  Lock,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";

function ProfileSettingsContent() {
  const { data: session, status, update } = useSession();
  const searchParams = useSearchParams();
  const triggerVerifyParam = searchParams.get("triggerVerify");

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [connectingGithub, setConnectingGithub] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationSent, setVerificationSent] = useState(false);

  // Form Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  // States
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [githubInput, setGithubInput] = useState("");

  /* ---------------------------
     Fetch fresh profile data
  ---------------------------- */
  async function fetchProfile() {
    try {
      const res = await api.get("/auth/me");
      const user = res.data;
      if (user) {
        setName(user.name || "");
        setEmail(user.email || "");
        setRole(user.role || "");
        setBio(user.bio || "");
        setCompany(user.company || "");
        setGithubUsername(user.githubUsername || "");
        setEmailVerified(user.emailVerified ?? false);
        if (user.image) {
          setAvatarPreview(user.image);
        }
      }
    } catch (err) {
      console.error("Failed to fetch profile info:", err);
      toast.error("Failed to fetch latest profile info.");
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  /* ---------------------------
     Handle Layout Banner Trigger (Query parameter check)
  ---------------------------- */
  useEffect(() => {
    if (loadingProfile === false && emailVerified === false) {
      if (triggerVerifyParam === "true") {
        handleResendVerification(email);
        
        const scrollTarget = () => {
          const el = document.getElementById("email-verification-card");
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-amber-500", "ring-offset-2");
            setTimeout(() => {
              el.classList.remove("ring-2", "ring-amber-500", "ring-offset-2");
            }, 2000);
            return true;
          }
          return false;
        };

        if (!scrollTarget()) {
          setTimeout(scrollTarget, 100);
          setTimeout(scrollTarget, 400);
        }
      }
    }
  }, [loadingProfile, emailVerified, triggerVerifyParam]);

  /* ---------------------------
     Resend cooldown timer
  ---------------------------- */
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown(c => c - 1);
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  /* ---------------------------
     Save general profile
  ---------------------------- */
  async function handleSaveProfile() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSavingProfile(true);
    try {
      await api.put("/user/profile", {
        name,
        role: role.trim() || null,
        bio: bio.trim() || null,
        company: company.trim() || null,
      });

      await update({ name });
      toast.success("Profile details saved successfully!");
      fetchProfile();
    } catch (err) {
      toast.error("Failed to save profile details.");
    } finally {
      setSavingProfile(false);
    }
  }

  /* ---------------------------
     Avatar upload (Base64)
  ---------------------------- */
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image file size should be less than 2MB.");
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64String = reader.result as string;
        setAvatarPreview(base64String);

        const res = await api.post("/user/avatar", { image: base64String });
        await update({ image: res.data.image });
        toast.success("Avatar updated successfully!");
        fetchProfile();
      } catch (err) {
        toast.error("Failed to upload avatar image.");
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read image file.");
      setUploading(false);
    };
  }

  /* ---------------------------
     Resend verification OTP
  ---------------------------- */
  async function handleResendVerification(targetEmail?: any) {
    if (resendCooldown > 0) return;

    try {
      const activeEmail = (typeof targetEmail === "string" ? targetEmail : null) || email || session?.user?.email;
      if (!activeEmail) return;

      await api.post("/auth/resend-verification", { email: activeEmail });
      setVerificationSent(true);
      setResendCooldown(30);

      toast.success("Verification code sent! Check your inbox.");
    } catch (err) {
      toast.error("Failed to send verification email");
    }
  }

  /* ---------------------------
     Verify OTP
  ---------------------------- */
  async function handleVerifyOtp() {
    if (!otp.trim() || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP code.");
      return;
    }

    setVerifyingOtp(true);
    try {
      await api.post("/auth/verify-otp", {
        email,
        otp: otp.trim(),
      });

      toast.success("Email verified successfully!");
      setEmailVerified(true);
      setOtp("");
      await update({ emailVerified: true });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("user-verification-updated", { detail: true }));
      }
      fetchProfile();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Invalid or expired OTP code.";
      toast.error(errorMsg);
    } finally {
      setVerifyingOtp(false);
    }
  }

  /* ---------------------------
     GitHub integration actions
  ---------------------------- */
  async function handleConnectGithub() {
    if (!githubInput.trim()) {
      toast.error("Please enter a valid GitHub username.");
      return;
    }

    setConnectingGithub(true);
    try {
      const res = await api.post("/user/connect-github", {
        username: githubInput.trim(),
      });
      toast.success("GitHub account connected successfully!");
      setGithubUsername(res.data.githubUsername);
      setGithubInput("");
      fetchProfile();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Failed to connect GitHub.";
      toast.error(errorMsg);
    } finally {
      setConnectingGithub(false);
    }
  }

  async function handleDisconnectGithub() {
    if (!confirm("Are you sure you want to disconnect your GitHub integration?")) {
      return;
    }

    try {
      await api.post("/user/disconnect-github");
      toast.success("GitHub account disconnected.");
      setGithubUsername("");
      fetchProfile();
    } catch (err) {
      toast.error("Failed to disconnect GitHub.");
    }
  }

  if (loadingProfile || status === "loading") {
    return (
      <div className="max-w-6xl mx-auto space-y-8 p-4 animate-pulse">
        <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-80 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <div className="h-44 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
            <div className="h-44 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4 animate-fadeIn">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Account Settings
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Update your profile info, connect your developer tools, and manage authorization levels.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: General Info Form */}
        <div className="lg:col-span-2">
          <Card className="p-6 md:p-8 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-150 dark:border-white/5 pb-6 mb-6">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <User size={18} className="text-indigo-500" />
                  Personal Profile
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Your public profile configuration details.
                </p>
              </div>
            </div>

            {/* Profile Avatar Selection Row */}
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-8 bg-zinc-50/50 dark:bg-white/[0.02] p-4 rounded-2xl border border-zinc-200/40 dark:border-white/5">
              <div className="relative group w-20 h-20 rounded-full overflow-hidden border-2 border-indigo-500/30 flex items-center justify-center cursor-pointer shadow-md bg-zinc-200 dark:bg-zinc-800">
                <Image
                  src={avatarPreview || "/avatar-placeholder.png"}
                  alt="Avatar preview"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
                <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all cursor-pointer text-white">
                  <Camera size={20} className="mb-0.5 animate-pulse" />
                  <span className="text-[10px] font-medium">Update</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleAvatarChange}
                  />
                </label>
                {uploading && (
                  <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-indigo-500" />
                  </div>
                )}
              </div>
              <div className="text-center sm:text-left">
                <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Profile Picture</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[320px]">
                  Choose a custom JPG or PNG. Maximum size allowed is 2MB.
                </p>
              </div>
            </div>

            {/* Input Grid */}
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Full Name</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                      <User size={16} />
                    </span>
                    <Input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      className="pl-10 h-11 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Email (Read only) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                      <Mail size={16} />
                    </span>
                    <Input
                      value={email}
                      disabled
                      className="pl-10 h-11 rounded-xl bg-zinc-100/50 dark:bg-zinc-900/80 border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 cursor-not-allowed opacity-80"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Role */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Current Role</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                      <Briefcase size={16} />
                    </span>
                    <Input
                      value={role}
                      onChange={e => setRole(e.target.value)}
                      placeholder="e.g. Lead Engineer"
                      className="pl-10 h-11 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Company */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Company</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                      <Building size={16} />
                    </span>
                    <Input
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      placeholder="e.g. Stripe"
                      className="pl-10 h-11 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10 focus:ring-indigo-500/50 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Short Bio</label>
                  <span className="text-[10px] text-zinc-400">{200 - bio.length} chars left</span>
                </div>
                <div className="relative">
                  <span className="absolute top-3 left-3.5 flex items-start pointer-events-none text-zinc-400">
                    <FileText size={16} />
                  </span>
                  <Textarea
                    value={bio}
                    onChange={e => setBio(e.target.value.slice(0, 200))}
                    placeholder="Tell us about yourself..."
                    rows={4}
                    className="pl-10 pt-2.5 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 pt-6 border-t border-zinc-150 dark:border-white/5 flex items-center justify-between">
              <Link
                href="/dashboard/settings/security"
                className="text-xs font-semibold text-zinc-500 hover:text-indigo-500 transition-colors flex items-center gap-1 group"
              >
                <Lock size={12} />
                Security Settings
                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-6 shadow-md shadow-indigo-500/10 font-semibold"
              >
                {savingProfile ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Identity Services & Verification */}
        <div className="space-y-8">
          {/* Card: Email Verification */}
          <Card id="email-verification-card" className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Email Verification</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Verify your account credentials.</p>
              </div>

              {emailVerified ? (
                <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  <CheckCircle2 size={10} />
                  Verified
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
                  <AlertTriangle size={10} />
                  Pending
                </div>
              )}
            </div>

            {emailVerified ? (
              <div className="bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl p-4 text-xs text-zinc-500 dark:text-zinc-400">
                Your email address <strong className="text-zinc-800 dark:text-zinc-200">{email}</strong> has been successfully verified. You have full access to deploy services.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-amber-500/[0.03] border border-amber-500/15 rounded-xl p-4 text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
                  <p>
                    Please verify your account to unlock deployments and project creation features.
                  </p>
                  <button
                    onClick={handleResendVerification}
                    disabled={resendCooldown > 0}
                    className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 disabled:opacity-50 flex items-center gap-1 text-left"
                  >
                    {resendCooldown > 0 
                      ? `Resend available in ${resendCooldown}s` 
                      : "Send verification code OTP"}
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">6-Digit Verification Code</label>
                  <div className="flex gap-2">
                    <Input
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      maxLength={6}
                      className="h-10 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10 text-center tracking-[0.25em] font-mono text-base"
                    />
                    <Button
                      onClick={handleVerifyOtp}
                      disabled={verifyingOtp || otp.length !== 6}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 px-4 font-semibold"
                    >
                      {verifyingOtp ? <Loader2 size={16} className="animate-spin" /> : "Verify"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Card: GitHub Integration */}
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Github size={18} className="text-zinc-800 dark:text-zinc-200" />
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">GitHub Integration</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Deploy directly from your repositories.</p>
              </div>
            </div>

            {githubUsername ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-150 dark:bg-white/5 flex items-center justify-center border border-zinc-200 dark:border-white/10">
                      <Github size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Linked Account</h4>
                      <p className="text-xs text-zinc-500">@{githubUsername}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDisconnectGithub}
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10 text-xs rounded-xl h-8"
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Connect your GitHub profile to import projects and trigger automated builds.
                </p>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">GitHub Username</label>
                  <div className="flex gap-2">
                    <Input
                      value={githubInput}
                      onChange={e => setGithubInput(e.target.value)}
                      placeholder="e.g. octocat"
                      className="h-10 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
                    />
                    <Button
                      onClick={handleConnectGithub}
                      disabled={connectingGithub || !githubInput.trim()}
                      className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black rounded-xl h-10 px-4 font-semibold text-xs"
                    >
                      {connectingGithub ? <Loader2 size={16} className="animate-spin" /> : "Connect"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto space-y-8 p-4 animate-pulse">
        <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-80 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <div className="h-44 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
            <div className="h-44 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
          </div>
        </div>
      </div>
    }>
      <ProfileSettingsContent />
    </Suspense>
  );
}
