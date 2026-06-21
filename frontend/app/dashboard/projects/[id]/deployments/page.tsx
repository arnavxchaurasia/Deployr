"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Rocket,
  Loader2,
  AlertTriangle,
  Globe,
  Trash2,
  FileText,
  Clock,
  GitBranch,
  ArrowRight,
  MonitorPlay,
  StopCircle
} from "lucide-react";
import { motion } from "framer-motion";

type DeploymentStatus = "QUEUED" | "BUILDING" | "READY" | "FAILED";

type Deployment = {
  id: string;
  status: DeploymentStatus;
  branch: string | null;
  trigger: string;
  createdAt: string;
  buildTimeMs: number | null;
  isProduction: boolean;
  previewUrl: string | null;
  canPromote: boolean;
  canDelete: boolean;
  canViewLogs: boolean;
};

function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

function StatusBadge({ status }: { status: DeploymentStatus }) {
  const base = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border";

  switch (status) {
    case "READY":
      return (
        <span className={`${base} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          Ready
        </span>
      );
    case "BUILDING":
      return (
        <span className={`${base} bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20`}>
          <Loader2 size={10} className="animate-spin" />
          Building
        </span>
      );
    case "FAILED":
      return (
        <span className={`${base} bg-red-500/10 text-red-650 dark:text-red-400 border-red-500/20`}>
          <AlertTriangle size={10} />
          Failed
        </span>
      );
    default:
      return (
        <span className={`${base} bg-zinc-500/10 text-zinc-650 dark:text-zinc-400 border-zinc-500/20`}>
          Queued
        </span>
      );
  }
}

export default function DeploymentsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeployments = useCallback(async () => {
    if (!projectId) return;

    try {
      const res = await api.get(`/project/${projectId}/deployments`);
      setDeployments(res.data.data ?? []);
    } catch (err) {
      console.error("Failed to load deployments", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDeployments();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchDeployments();
    }, 5000);
    return () => clearInterval(interval);
  }, [projectId, fetchDeployments]);

  async function promote(deploymentId: string) {
    await api.post(`/deployments/${deploymentId}/promote`);
    fetchDeployments();
  }

  async function unpublishProject() {
    if (!confirm("Unpublish project? Production URL will go offline.")) return;
    await api.post(`/projects/${projectId}/unpublish`);
    fetchDeployments();
  }

  async function remove(deploymentId: string) {
    if (!confirm("Delete this deployment permanently?")) return;
    await api.delete(`/deployments/${deploymentId}`);
    fetchDeployments();
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4 p-4 animate-pulse">
        <div className="h-10 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg mb-8" />
        <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
        <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
        <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-20">
      
      {/* Top Console Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
        <button onClick={() => router.back()} className="hover:text-zinc-900 dark:hover:text-white transition-colors">Project</button>
        <span>/</span>
        <span className="text-zinc-650 dark:text-zinc-200">Deployments</span>
      </div>

      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-zinc-150 dark:border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
            Deployments History
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
            Every build and release attached to this repository.
          </p>
        </div>

        <Button 
          variant="outline" 
          onClick={() => router.back()}
          className="bg-white/50 dark:bg-black/20 border-zinc-200 dark:border-white/10 rounded-xl h-11 px-5 font-semibold"
        >
          Back to Overview
        </Button>
      </div>

      {deployments.length === 0 ? (
        <Card className="p-16 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md text-center">
          <MonitorPlay size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
          <h3 className="text-lg font-bold">No Deployments Found</h3>
          <p className="text-sm text-zinc-500 mt-1">This project hasn't been deployed yet.</p>
        </Card>
      ) : (
        <div className="space-y-4 relative">
          {deployments.map((dep, idx) => (
            <motion.div 
              key={dep.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="group p-5 md:p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md hover:bg-white/60 dark:hover:bg-white/[0.02] shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden">
                {dep.isProduction && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                )}
                
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pl-2">
                  
                  {/* Left info */}
                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {dep.id.slice(0, 8)}
                      </span>
                      <StatusBadge status={dep.status} />
                      {dep.isProduction && (
                        <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0">
                          Production
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
                      <p className="flex items-center gap-1.5">
                        <GitBranch size={12} />
                        {dep.branch ?? "main"}
                      </p>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                      <p className="flex items-center gap-1.5">
                        <MonitorPlay size={12} />
                        {dep.trigger}
                      </p>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                      <p className="flex items-center gap-1.5">
                        <Clock size={12} />
                        {formatDuration(dep.buildTimeMs)}
                      </p>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                      <p>
                        {new Date(dep.createdAt).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                        })}
                      </p>
                    </div>

                    {dep.previewUrl ? (
                      <a
                        href={dep.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-600 font-medium break-all"
                      >
                        {dep.previewUrl}
                        <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                      </a>
                    ) : (
                      <p className="text-[11px] text-zinc-400">Preview not available</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {dep.canViewLogs && (
                      <Button
                        variant="ghost"
                        onClick={() => router.push(`/dashboard/logs/${dep.id}`)}
                        className="text-zinc-600 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl h-9 px-3 text-xs font-semibold"
                      >
                        <FileText size={14} className="mr-1.5" />
                        Logs
                      </Button>
                    )}

                    {dep.canPromote && (
                      <Button 
                        onClick={() => promote(dep.id)}
                        className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl h-9 px-3 text-xs font-bold"
                      >
                        <Rocket size={14} className="mr-1.5" />
                        Promote
                      </Button>
                    )}

                    {dep.isProduction && (
                      <Button
                        variant="outline"
                        onClick={unpublishProject}
                        className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-500/10 rounded-xl h-9 px-3 text-xs font-semibold"
                      >
                        <StopCircle size={14} className="mr-1.5" />
                        Unpublish
                      </Button>
                    )}

                    {dep.canDelete && (
                      <Button
                        variant="ghost"
                        onClick={() => remove(dep.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl h-9 px-3 text-xs font-semibold"
                      >
                        <Trash2 size={14} className="mr-1.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
