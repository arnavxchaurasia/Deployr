"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, ShieldOff, RotateCcw, Loader2, ChevronDown, CheckCircle2, AlertTriangle } from "lucide-react";

type Project = { id: string; name: string };
type EncryptionStatus = {
  kmsKeyId: string | null;
  encryptedVarCount: number;
  lastRotatedAt: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function EncryptionPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const [confirmView, setConfirmView] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [rotating, setRotating] = useState(false);
  const [newKeyId, setNewKeyId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchStatus = useCallback(async (id: string) => {
    setLoading(true);
    setNewKeyId(null);
    setConfirmView(false);
    setConfirmInput("");
    try {
      const res = await api.get(`/project/${id}/encryption`);
      setStatus(res.data);
    } catch {
      setStatus({ kmsKeyId: null, encryptedVarCount: 0, lastRotatedAt: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchStatus(selectedId); }, [selectedId, fetchStatus]);

  async function handleRotate() {
    if (!selectedId || confirmInput !== "ROTATE") return;
    setRotating(true);
    try {
      const res = await api.post(`/project/${selectedId}/encryption/rotate`, {});
      const updated: EncryptionStatus = res.data;
      setStatus(updated);
      setNewKeyId(updated.kmsKeyId);
      setConfirmView(false);
      setConfirmInput("");
      toast.success("Encryption key rotated successfully");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Key rotation failed");
    } finally {
      setRotating(false);
    }
  }

  const kmsEnabled = !!status?.kmsKeyId;
  const selectCls = "h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none w-64";

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Encryption
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Manage KMS encryption for environment variables and rotate keys on a schedule.
        </p>
      </div>

      <div className="relative w-64">
        <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className={selectCls}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-3 text-zinc-400 pointer-events-none" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
      ) : status ? (
        <div className="space-y-5">
          {/* Status card */}
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kmsEnabled ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-zinc-500/10 border border-zinc-500/20"}`}>
                  {kmsEnabled ? <ShieldCheck size={18} className="text-emerald-500" /> : <ShieldOff size={18} className="text-zinc-400" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">KMS Encryption</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Customer-managed key encryption for env vars</p>
                </div>
              </div>
              {kmsEnabled ? (
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">Enabled</Badge>
              ) : (
                <Badge className="bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20 text-[11px] font-semibold">Disabled</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Encrypted Vars</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mt-0.5 font-mono">{status.encryptedVarCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Last Rotated</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mt-0.5">{formatDate(status.lastRotatedAt)}</p>
              </div>
            </div>

            {kmsEnabled && (
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Current Key ID</p>
                <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300 break-all">{status.kmsKeyId}</p>
              </div>
            )}
          </Card>

          {/* New key banner */}
          {newKeyId && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Key rotated successfully</p>
                <p className="font-mono text-xs mt-1 break-all">{newKeyId}</p>
              </div>
            </div>
          )}

          {/* Rotate card */}
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <RotateCcw size={16} className="text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Rotate Encryption Key</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Generate a new KMS key and re-encrypt all environment variables. All existing deployments will be re-keyed automatically.
                </p>
              </div>
            </div>

            {!confirmView ? (
              <Button
                onClick={() => setConfirmView(true)}
                disabled={!kmsEnabled}
                variant="outline"
                className="w-full h-10 rounded-xl text-sm font-semibold border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
              >
                <RotateCcw size={14} className="mr-1.5" />Rotate encryption key
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                    This will rotate the KMS key and re-encrypt all variables. Type <strong>ROTATE</strong> to confirm.
                  </p>
                </div>
                <Input
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type ROTATE to confirm"
                  className="h-9 rounded-xl text-sm font-mono bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
                />
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setConfirmView(false); setConfirmInput(""); }} className="flex-1 h-9 rounded-xl text-sm">Cancel</Button>
                  <Button
                    onClick={handleRotate}
                    disabled={rotating || confirmInput !== "ROTATE"}
                    className="flex-1 h-9 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white"
                  >
                    {rotating ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                    Confirm rotation
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
