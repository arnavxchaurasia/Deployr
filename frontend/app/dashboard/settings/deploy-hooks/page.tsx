"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Webhook, Copy, RefreshCw, Loader2, ChevronDown, CheckCircle2, Info } from "lucide-react";

type Project = { id: string; name: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function DeployHooksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchToken = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/project/${id}`);
      setToken(res.data?.deployHookToken ?? null);
    } catch {
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchToken(selectedId); }, [selectedId, fetchToken]);

  async function handleRegenerate() {
    if (!selectedId) return;
    if (!confirm("Regenerate the deploy hook token? The old URL will stop working immediately.")) return;
    setRegenerating(true);
    try {
      const res = await api.post(`/project/${selectedId}/regenerate-hook-token`);
      setToken(res.data?.deployHookToken ?? res.data?.token ?? null);
      toast.success("Deploy hook token regenerated");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to regenerate token");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopy() {
    if (!hookUrl) return;
    await navigator.clipboard.writeText(hookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hookUrl = token ? `${API_URL}/hooks/${token}` : null;

  const selectCls =
    "w-full h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none";

  return (
    <div className="max-w-2xl space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Deploy Hooks
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Trigger a deployment by sending an HTTP GET or POST request to your project&apos;s unique hook URL.
        </p>
      </div>

      {/* Project selector */}
      <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-2">
          Project
        </label>
        <div className="relative">
          <select
            className={selectCls}
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
      </Card>

      {/* Hook URL card */}
      <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Webhook size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Hook URL</h3>
            <p className="text-xs text-zinc-500">Send a GET or POST request to trigger a deploy</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={22} className="animate-spin text-zinc-400" />
          </div>
        ) : hookUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3">
              <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300 flex-1 break-all select-all">
                {hookUrl}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="shrink-0 h-8 px-3 rounded-lg"
              >
                {copied ? (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400 text-center py-4">No hook token found for this project.</p>
        )}

        {/* Info box */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5 text-zinc-600 dark:text-zinc-400">
          <Info size={16} className="shrink-0 mt-0.5 text-indigo-500" />
          <p className="text-xs leading-relaxed">
            Anyone with this URL can trigger a deployment. Treat it like a secret.
            Use HTTP GET or POST — no authentication headers are required.
            Regenerating will immediately invalidate the old URL.
          </p>
        </div>

        <Button
          onClick={handleRegenerate}
          disabled={regenerating || !selectedId}
          variant="outline"
          className="w-full h-11 rounded-xl font-semibold border-zinc-200 dark:border-white/10"
        >
          {regenerating ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <RefreshCw size={16} className="mr-2" />
          )}
          Regenerate Token
        </Button>
      </Card>
    </div>
  );
}
