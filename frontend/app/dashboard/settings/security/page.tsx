"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Laptop, Smartphone, Monitor, ShieldAlert, CheckCircle2, AlertTriangle, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

type LoginSession = {
  id: string;
  device: string;
  os: string;
  browser: string;
  ip: string;
  createdAt: string;
};

export default function SecuritySettingsPage() {
  const { data: session } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loadingPass, setLoadingPass] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [clearingSessions, setClearingSessions] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<LoginSession[]>([]);

  // 2FA state
  type TotpView = "idle" | "setup" | "disabling";
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [totpView, setTotpView] = useState<TotpView>("idle");
  const [totpQr, setTotpQr] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);

  const call = {
    get:  (url: string) => api.get(url).then(r => r.data),
    post: (url: string, b?: unknown) => api.post(url, b).then(r => r.data),
  };

  // Fetch real-time email verification status, sessions, and 2FA status
  useEffect(() => {
    async function loadSecurityData() {
      try {
        const [meRes, sessionsRes, totpRes] = await Promise.all([
          api.get("/auth/me"),
          api.get("/auth/sessions"),
          api.get("/auth/2fa/status"),
        ]);

        setEmailVerified(meRes.data?.emailVerified ?? false);
        setSessions(sessionsRes.data?.data || []);
        setTotpEnabled(totpRes.data?.enabled ?? false);
      } catch (err) {
        console.error("Failed to load security data:", err);
      } finally {
        setLoadingSessions(false);
      }
    }
    loadSecurityData();
  }, []);

  async function handleTotpSetup() {
    setTotpLoading(true);
    try {
      const data = await call.post("/auth/2fa/setup");
      setTotpQr(data.qrDataUrl);
      setTotpSecret(data.secret);
      setTotpCode("");
      setTotpView("setup");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to start 2FA setup");
    } finally {
      setTotpLoading(false);
    }
  }

  async function handleTotpVerify() {
    if (!totpCode) { toast.error("Enter the 6-digit code from your authenticator app"); return; }
    setTotpLoading(true);
    try {
      await call.post("/auth/2fa/verify", { code: totpCode });
      setTotpEnabled(true);
      setTotpView("idle");
      setTotpQr("");
      setTotpSecret("");
      setTotpCode("");
      toast.success("Two-factor authentication enabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Invalid code — please try again");
    } finally {
      setTotpLoading(false);
    }
  }

  async function handleTotpDisable() {
    if (!totpCode) { toast.error("Enter the 6-digit code to confirm"); return; }
    setTotpLoading(true);
    try {
      await call.post("/auth/2fa/disable", { code: totpCode });
      setTotpEnabled(false);
      setTotpView("idle");
      setTotpCode("");
      toast.success("Two-factor authentication disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Invalid code — please try again");
    } finally {
      setTotpLoading(false);
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword) {
      toast.error("All fields are required");
      return;
    }

    setLoadingPass(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });

      toast.success("Password updated successfully. Please sign in again.");

      setTimeout(() => {
        signOut({ callbackUrl: "/auth" });
      }, 1500);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update password");
    } finally {
      setLoadingPass(false);
    }
  }

  async function handleLogoutEverywhere() {
    if (!confirm("Are you sure you want to log out of all devices? This will invalidate all active sessions.")) return;
    
    setClearingSessions(true);
    try {
      await api.delete("/auth/sessions/all");
      toast.success("All other sessions have been terminated.");
      // Automatically log them out of the current session as well
      signOut({ callbackUrl: "/auth" });
    } catch (err) {
      toast.error("Failed to terminate sessions.");
      setClearingSessions(false);
    }
  }

  const getDeviceIcon = (device: string, os: string) => {
    const d = device.toLowerCase();
    const o = os.toLowerCase();
    if (d.includes("mobile") || d.includes("iphone") || o.includes("ios") || o.includes("android")) {
      return <Smartphone size={24} className="text-zinc-400" />;
    }
    if (d.includes("mac") || o.includes("mac")) {
      return <Laptop size={24} className="text-zinc-400" />;
    }
    return <Monitor size={24} className="text-zinc-400" />;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn pb-20">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Security Settings
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Manage your account security, passwords, and active sessions.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Left Column: Password & Email Status */}
        <div className="space-y-8">
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Email Verification</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Your current security status.</p>
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Status</span>
              {emailVerified === null ? (
                <div className="h-6 w-20 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              ) : emailVerified ? (
                <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide">
                  <CheckCircle2 size={14} />
                  Verified
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide animate-pulse">
                  <AlertTriangle size={14} />
                  Not Verified
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Change Password</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Ensure your account is using a long, random password.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Current Password</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="h-11 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="h-11 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
                />
                <p className="text-[10px] text-zinc-400 mt-1">Minimum 8 characters, uppercase, number & symbol</p>
              </div>

              <Button
                onClick={changePassword}
                disabled={loadingPass || !currentPassword || !newPassword}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 shadow-md shadow-indigo-500/10 font-semibold"
              >
                {loadingPass ? <Loader2 size={16} className="animate-spin" /> : "Update Password"}
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Sessions */}
        <Card className="p-0 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
          <div className="p-6 border-b border-zinc-150 dark:border-white/5 flex items-center justify-between bg-zinc-50/50 dark:bg-white/[0.01]">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Active Sessions</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Devices currently logged into your account.</p>
            </div>
          </div>
          
          <div className="divide-y divide-zinc-150 dark:divide-white/5">
            {loadingSessions ? (
              <div className="p-8 flex justify-center">
                <Loader2 size={24} className="animate-spin text-zinc-400" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                No active sessions found. Log in again to track your device.
              </div>
            ) : (
              sessions.map((sess, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={sess.id} 
                  className="p-5 flex items-start gap-4 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center shrink-0">
                    {getDeviceIcon(sess.device, sess.os)}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {sess.device === "Desktop PC" && sess.os !== "Unknown OS" 
                          ? `${sess.os} Device` 
                          : sess.device}
                      </h4>
                      {idx === 0 && (
                        <span className="shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{sess.browser}</span>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                      <span className="font-mono">{sess.ip}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1.5">
                      Last active: {new Date(sess.createdAt).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          <div className="p-6 bg-zinc-50/50 dark:bg-white/[0.01] border-t border-zinc-150 dark:border-white/5">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-red-600 dark:text-red-400 mb-4">
              <ShieldAlert size={20} className="shrink-0" />
              <p className="text-xs leading-relaxed">
                If you notice a device you don't recognize, log out of all devices immediately and change your password.
              </p>
            </div>
            <Button
              variant="destructive"
              disabled={clearingSessions || sessions.length === 0}
              onClick={handleLogoutEverywhere}
              className="w-full font-bold h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/10"
            >
              {clearingSessions ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Log out of all devices
            </Button>
          </div>
        </Card>
      </div>

      {/* Two-Factor Authentication */}
      <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Two-Factor Authentication</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Add an extra layer of security. You&apos;ll need an authenticator app (Google Authenticator, Authy, etc.).
            </p>
          </div>
          {totpEnabled !== null && (
            totpEnabled ? (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide shrink-0">
                <ShieldCheck size={14} />
                Enabled
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide shrink-0">
                <ShieldOff size={14} />
                Disabled
              </div>
            )
          )}
        </div>

        {totpEnabled === null ? (
          <div className="flex justify-center py-4">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : totpEnabled && totpView === "idle" ? (
          /* ── Enabled state ── */
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={18} className="shrink-0" />
              <p className="text-sm">Your account is protected with two-factor authentication.</p>
            </div>
            <Button
              variant="destructive"
              onClick={() => { setTotpView("disabling"); setTotpCode(""); }}
              className="w-full h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold shadow-md shadow-red-500/10"
            >
              Disable 2FA
            </Button>
          </div>
        ) : totpView === "disabling" ? (
          /* ── Disable confirmation state ── */
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Enter the 6-digit code from your authenticator app to confirm.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Authenticator Code</label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="h-11 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10 font-mono tracking-widest text-center text-lg"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setTotpView("idle"); setTotpCode(""); }}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleTotpDisable}
                disabled={totpLoading || totpCode.length < 6}
                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 font-semibold"
              >
                {totpLoading ? <Loader2 size={16} className="animate-spin" /> : "Confirm Disable"}
              </Button>
            </div>
          </div>
        ) : totpView === "setup" ? (
          /* ── QR code / setup state ── */
          <div className="space-y-5">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={totpQr} alt="2FA QR code" className="rounded-xl border border-zinc-200 dark:border-white/10 w-48 h-48" />
            </div>
            <div className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Manual entry key</p>
              <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300 break-all select-all">{totpSecret}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Authenticator Code</label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="h-11 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10 font-mono tracking-widest text-center text-lg"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setTotpView("idle"); setTotpQr(""); setTotpSecret(""); setTotpCode(""); }}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleTotpVerify}
                disabled={totpLoading || totpCode.length < 6}
                className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/10"
              >
                {totpLoading ? <Loader2 size={16} className="animate-spin" /> : "Confirm & Enable"}
              </Button>
            </div>
          </div>
        ) : (
          /* ── Not enabled / idle state ── */
          <Button
            onClick={handleTotpSetup}
            disabled={totpLoading}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/10"
          >
            {totpLoading ? <Loader2 size={16} className="animate-spin" /> : "Enable 2FA"}
          </Button>
        )}
      </Card>
    </div>
  );
}
