"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ShieldCheck, ShieldOff, CheckCircle2, Loader2,
} from "lucide-react";

type TotpView = "idle" | "setup" | "disabling";

export default function TwoFactorPage() {
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [view, setView] = useState<TotpView>("idle");
  const [qrUri, setQrUri] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    api.get("/auth/2fa/status")
      .then((r) => setTotpEnabled(r.data?.enabled ?? false))
      .catch(() => setTotpEnabled(false))
      .finally(() => setStatusLoading(false));
  }, []);

  async function startSetup() {
    setLoading(true);
    try {
      const r = await api.post("/auth/2fa/setup");
      setQrUri(r.data?.qrUri ?? r.data?.qrDataUrl ?? "");
      setSecret(r.data?.secret ?? "");
      setCode("");
      setView("setup");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to start 2FA setup");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (!code) { toast.error("Enter the 6-digit code"); return; }
    setLoading(true);
    try {
      await api.post("/auth/2fa/verify", { token: code, code });
      setTotpEnabled(true);
      setView("idle");
      setQrUri(""); setSecret(""); setCode("");
      toast.success("Two-factor authentication enabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Invalid code — try again");
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    if (!code) { toast.error("Enter the 6-digit code to confirm"); return; }
    setLoading(true);
    try {
      await api.post("/auth/2fa/disable", { token: code, code });
      setTotpEnabled(false);
      setView("idle");
      setCode("");
      toast.success("Two-factor authentication disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Invalid code — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Two-Factor Authentication
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Protect your account with a time-based one-time password (TOTP) from an authenticator app.
        </p>
      </div>

      <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-5">
        {/* Status badge */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Status</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Use Google Authenticator, Authy, or any TOTP app.
            </p>
          </div>
          {statusLoading ? (
            <div className="h-7 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
          ) : totpEnabled ? (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-bold">
              <ShieldCheck size={13} /> Enabled
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-zinc-500/10 text-zinc-500 border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 rounded-full text-xs font-bold">
              <ShieldOff size={13} /> Disabled
            </div>
          )}
        </div>

        {statusLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 size={22} className="animate-spin text-zinc-400" />
          </div>
        ) : view === "setup" ? (
          <div className="space-y-5">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Scan the QR code with your authenticator app, then enter the 6-digit code to activate.
            </p>
            {qrUri && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUri} alt="2FA QR code" className="rounded-xl border border-zinc-200 dark:border-white/10 w-48 h-48" />
              </div>
            )}
            {secret && (
              <div className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Manual entry key</p>
                <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300 break-all select-all">{secret}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Authenticator Code
              </label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-11 rounded-xl font-mono tracking-widest text-center text-lg bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setView("idle"); setQrUri(""); setSecret(""); setCode(""); }}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={verify}
                disabled={loading || code.length < 6}
                className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Confirm & Enable"}
              </Button>
            </div>
          </div>
        ) : view === "disabling" ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Enter the 6-digit code from your authenticator app to disable 2FA.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Authenticator Code
              </label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-11 rounded-xl font-mono tracking-widest text-center text-lg bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setView("idle"); setCode(""); }}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={disable}
                disabled={loading || code.length < 6}
                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 font-semibold"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Confirm Disable"}
              </Button>
            </div>
          </div>
        ) : totpEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={18} className="shrink-0" />
              <p className="text-sm">Your account is protected with two-factor authentication.</p>
            </div>
            <Button
              variant="destructive"
              onClick={() => { setView("disabling"); setCode(""); }}
              className="w-full h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              Disable 2FA
            </Button>
          </div>
        ) : (
          <Button
            onClick={startSetup}
            disabled={loading}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/10"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Enable 2FA"}
          </Button>
        )}
      </Card>
    </div>
  );
}
