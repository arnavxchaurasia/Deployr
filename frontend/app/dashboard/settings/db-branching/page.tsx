"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { GitBranch, Database, Webhook, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";

type Project = { id: string; name: string };
type DbBranchingStatus = {
  enabled: boolean;
  webhookConfigured: boolean;
  activePreviewCount: number;
};

export default function DbBranchingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<DbBranchingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchStatus = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/project/${id}/db-branching`);
      setStatus(res.data);
    } catch {
      setStatus({ enabled: false, webhookConfigured: false, activePreviewCount: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchStatus(selectedId); }, [selectedId, fetchStatus]);

  async function handleToggle(enabled: boolean) {
    if (!selectedId) return;
    if (enabled && !status?.webhookConfigured) {
      toast.error("A storage addon webhook must be configured before enabling DB branching.");
      return;
    }
    setToggling(true);
    try {
      const res = await api.patch(`/project/${selectedId}/db-branching`, { enabled });
      setStatus((s) => s ? { ...s, enabled: res.data?.enabled ?? enabled } : s);
      toast.success(enabled ? "DB branching enabled" : "DB branching disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update setting");
    } finally {
      setToggling(false);
    }
  }

  const selectCls = "h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none w-64";

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Database Branching
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Automatically provision isolated database branches for each preview deployment.
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
          {/* Enable toggle */}
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${status.enabled ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-zinc-500/10 border border-zinc-500/20"}`}>
                  <Database size={18} className={status.enabled ? "text-indigo-500" : "text-zinc-400"} />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Enable DB Branching</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Create a database snapshot per preview deployment</p>
                </div>
              </div>
              <Switch
                checked={status.enabled}
                onCheckedChange={handleToggle}
                disabled={toggling}
              />
            </div>
          </Card>

          {/* Webhook status */}
          <Card className="p-5 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Webhook size={16} className={status.webhookConfigured ? "text-emerald-500" : "text-amber-500"} />
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Storage Addon Webhook</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Required for DB branching to provision snapshots</p>
                </div>
              </div>
              {status.webhookConfigured ? (
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                  <CheckCircle2 size={11} className="mr-1" />Configured
                </Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-semibold">
                    <AlertTriangle size={11} className="mr-1" />Not configured
                  </Badge>
                  <Link href="/dashboard/integrations" className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-0.5">
                    Set up<ExternalLink size={10} className="ml-0.5" />
                  </Link>
                </div>
              )}
            </div>
          </Card>

          {/* Active previews */}
          <Card className="p-5 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch size={16} className="text-indigo-500" />
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Active Preview Deployments</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Deployments currently using a branched database</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">{status.activePreviewCount}</span>
            </div>
          </Card>

          {/* Explainer */}
          <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/15 text-indigo-700 dark:text-indigo-300 space-y-1.5">
            <p className="text-xs font-semibold flex items-center gap-1.5"><Database size={13} />How DB branching works</p>
            <ul className="text-xs space-y-1 text-indigo-600 dark:text-indigo-400 list-disc list-inside leading-relaxed">
              <li>Each pull request preview deployment gets its own database snapshot.</li>
              <li>Schema migrations run against the branch database, not production.</li>
              <li>Branch databases are automatically deleted when the preview is torn down.</li>
              <li>Requires a connected storage addon (Neon, PlanetScale, Supabase, etc.) with a configured webhook.</li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
