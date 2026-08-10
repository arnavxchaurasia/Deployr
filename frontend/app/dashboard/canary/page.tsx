"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  GitBranch, ChevronDown, Loader2, TrendingUp,
  CheckCircle2, XCircle, AlertTriangle, Zap,
} from "lucide-react";

type Project = { id: string; name: string; canaryDeploymentId?: string | null; canaryPercent?: number | null };

interface Deployment {
  id: string;
  commitSha: string;
  commitMessage?: string;
  branch?: string;
  status: string;
  createdAt: string;
}

export default function CanaryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [canaryPercent, setCanaryPercent] = useState(10);
  const [canaryDeployId, setCanaryDeployId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [projRes, deploysRes] = await Promise.all([
        api.get(`/project/${id}`),
        api.get(`/project/${id}/deployments?status=READY&limit=10`),
      ]);
      setProject(projRes.data);
      setDeployments(deploysRes.data?.deployments ?? deploysRes.data ?? []);
    } catch {
      setProject(null);
      setDeployments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchProject(selectedId); }, [selectedId, fetchProject]);

  const hasCanary = !!project?.canaryDeploymentId;

  async function handlePromote() {
    if (!selectedId) return;
    setPromoting(true);
    try {
      await api.post(`/project/${selectedId}/canary/promote`);
      toast.success("Canary promoted to 100%");
      await fetchProject(selectedId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to promote canary");
    } finally {
      setPromoting(false);
    }
  }

  async function handleAbort() {
    if (!selectedId) return;
    if (!confirm("Abort canary deployment? Traffic will revert to the previous stable version.")) return;
    setAborting(true);
    try {
      await api.post(`/project/${selectedId}/canary/abort`);
      toast.success("Canary deployment aborted");
      await fetchProject(selectedId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to abort canary");
    } finally {
      setAborting(false);
    }
  }

  async function handleStart() {
    if (!selectedId || !canaryDeployId) { toast.error("Select a deployment first"); return; }
    setStarting(true);
    try {
      await api.post(`/project/${selectedId}/canary`, {
        deploymentId: canaryDeployId,
        percent: canaryPercent,
      });
      toast.success(`Canary started at ${canaryPercent}%`);
      await fetchProject(selectedId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to start canary");
    } finally {
      setStarting(false);
    }
  }

  const selectCls =
    "w-full h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none";

  return (
    <div className="max-w-2xl space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Canary Deployments
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Gradually roll out a new deployment to a percentage of traffic before promoting it.
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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-zinc-400" />
        </div>
      ) : hasCanary ? (
        /* Active canary */
        <Card className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/[0.04] backdrop-blur-md shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
              <Zap size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Canary Active</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Deployment <code className="font-mono">{project?.canaryDeploymentId?.slice(0, 8)}</code>
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Canary traffic</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{project?.canaryPercent ?? 0}%</span>
            </div>
            <div className="h-3 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                style={{ width: `${project?.canaryPercent ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleAbort}
              disabled={aborting}
              className="flex-1 h-11 rounded-xl border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 font-semibold"
            >
              {aborting ? <Loader2 size={16} className="animate-spin mr-2" /> : <XCircle size={15} className="mr-2" />}
              Abort
            </Button>
            <Button
              onClick={handlePromote}
              disabled={promoting}
              className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-500/10"
            >
              {promoting ? <Loader2 size={16} className="animate-spin mr-2" /> : <CheckCircle2 size={15} className="mr-2" />}
              Promote to 100%
            </Button>
          </div>
        </Card>
      ) : (
        /* Start canary */
        <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
              <TrendingUp size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Start Canary Deployment</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Route a percentage of traffic to a new deployment</p>
            </div>
          </div>

          {/* No canary active info */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5 text-zinc-500">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-zinc-400" />
            <p className="text-xs leading-relaxed">
              No canary deployment is active. Choose a recent READY deployment below and set the
              initial traffic percentage. You can promote or abort at any time.
            </p>
          </div>

          {/* Deployment picker */}
          {deployments.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-4">No READY deployments available.</p>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Deployment
              </label>
              <div className="relative">
                <select
                  className={selectCls}
                  value={canaryDeployId ?? ""}
                  onChange={(e) => setCanaryDeployId(e.target.value)}
                >
                  <option value="" disabled>Select a deployment…</option>
                  {deployments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.commitSha.slice(0, 7)} — {d.commitMessage?.slice(0, 50) ?? d.branch ?? d.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Percent slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Initial Traffic
              </label>
              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{canaryPercent}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={99}
              value={canaryPercent}
              onChange={(e) => setCanaryPercent(Number(e.target.value))}
              className="w-full h-2 rounded-full accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>1%</span>
              <span>99%</span>
            </div>
          </div>

          <Button
            onClick={handleStart}
            disabled={starting || !canaryDeployId}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/10"
          >
            {starting ? <Loader2 size={16} className="animate-spin mr-2" /> : <GitBranch size={15} className="mr-2" />}
            Start Canary at {canaryPercent}%
          </Button>
        </Card>
      )}
    </div>
  );
}
