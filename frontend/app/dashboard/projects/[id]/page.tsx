"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Rocket,
  Loader2,
  AlertTriangle,
  Globe,
  Settings,
  Trash2,
  GitBranch,
  Layers,
  Activity,
  Clock,
  Terminal,
  ExternalLink,
  Plus,
  Play,
  Sparkles,
  Search,
  HelpCircle,
  CheckCircle2,
  CalendarClock,
  Flag,
  Blocks,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";

/* ------------------------------------
   Types
   ------------------------------------ */
type ProjectStatus =
  | "READY"
  | "QUEUED"
  | "BUILDING"
  | "FAILED"
  | "NOT_DEPLOYED";

type Project = {
  id: string;
  name: string;
  slug: string;
  gitURL: string;
  status: ProjectStatus;
  deploymentsCount: number;
  liveUrl?: string | null;
  latestDeploymentId?: string | null;
  subDomain?: string;
};

type ProjectAnalytics = {
  totalDeployments: number;
  success: number;
  failed: number;
  avgBuildMs: number | null;
};

type UptimeData = {
  uptimePct: number | null;
  latest: { up: boolean; latencyMs: number | null } | null;
};

/* ------------------------------------
   Helpers
   ------------------------------------ */
function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border";

  switch (status) {
    case "READY":
      return (
        <span className={`${base} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
          Active
        </span>
      );
    case "BUILDING":
      return (
        <span className={`${base} bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20`}>
          <Loader2 size={12} className="animate-spin" />
          Building
        </span>
      );
    case "FAILED":
      return (
        <span className={`${base} bg-red-500/10 text-red-650 dark:text-red-400 border-red-500/20`}>
          <AlertTriangle size={12} />
          Failed
        </span>
      );
    case "QUEUED":
      return (
        <span className={`${base} bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20`}>
          <Clock size={12} />
          Queued
        </span>
      );
    default:
      return (
        <span className={`${base} bg-zinc-500/10 text-zinc-650 dark:text-zinc-400 border-zinc-500/20`}>
          Not deployed
        </span>
      );
  }
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [uptime, setUptime] = useState<UptimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;

    try {
      const [pRes, aRes] = await Promise.all([
        api.get(`/project/${id}`),
        api.get(`/project/${id}/analytics`),
      ]);

      setProject(pRes.data.data);
      setAnalytics(aRes.data.data);

      // Uptime is best-effort — don't fail the whole page if it errors
      api.get(`/project/${id}/uptime`).then((r: { data: UptimeData }) => setUptime(r.data)).catch(() => {});
    } catch {
      setProject(null);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchAll();
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [id, fetchAll]);

  async function deploy() {
    if (!id) return;
    try {
      setDeploying(true);
      const res = await api.post("/deploy", { projectId: id });
      const newDeploymentId = res.data.data?.id;
      toast.success("Deployment triggered! Preparing build environment.");
      if (newDeploymentId) {
        router.push(`/dashboard/logs/${newDeploymentId}`);
      } else {
        await fetchAll();
      }
    } catch (err) {
      toast.error("Failed to trigger deployment.");
    } finally {
      setDeploying(false);
    }
  }

  async function undeploy() {
    if (!id) return;
    try {
      setDeploying(true); // Re-use deploying state for loading indication
      await api.post("/undeploy", { projectId: id });
      toast.success("Project undeployed successfully.");
      await fetchAll();
    } catch (err) {
      toast.error("Failed to undeploy project.");
    } finally {
      setDeploying(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 p-4 animate-pulse">
        <div className="h-10 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-[450px] bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
          <div className="h-96 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-16 max-w-xl mx-auto text-center border border-zinc-200/50 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md rounded-2xl shadow-xl">
        <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Project Not Found</h2>
        <p className="text-sm text-zinc-500 mb-6">The requested deployment project does not exist or has been deleted.</p>
        <Link href="/dashboard">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">Back to Overview</Button>
        </Link>
      </div>
    );
  }

  const busy =
    deploying ||
    project.status === "QUEUED" ||
    project.status === "BUILDING";

  // Use subDomain configured locally or fall back to liveUrl
  const finalLiveUrl = project.liveUrl || (project.subDomain ? `https://slick-queens-train.loca.lt/?project=${project.subDomain}` : null);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-fadeIn">
      
      {/* Console Top Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
        <Link href="/dashboard/projects" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Projects</Link>
        <span>/</span>
        <span className="text-zinc-650 dark:text-zinc-200">{project.name}</span>
      </div>

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-150 dark:border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
              {project.name}
            </h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 flex items-center gap-1">
            <GitBranch size={12} />
            Linked repository: <span className="font-mono bg-zinc-100 dark:bg-white/5 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-350">{project.gitURL}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {finalLiveUrl && (
            <Button
              variant="outline"
              onClick={undeploy}
              disabled={busy}
              className="border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl h-11 px-4 text-xs font-semibold flex items-center gap-2 flex-1 sm:flex-none"
            >
              Stop Deployment
            </Button>
          )}
          {finalLiveUrl && (
            <Button
              variant="outline"
              onClick={() => window.open(finalLiveUrl, "_blank")}
              className="bg-white/50 dark:bg-black/20 border-zinc-200 dark:border-white/10 rounded-xl h-11 px-4 text-xs font-semibold flex items-center gap-2 flex-1 sm:flex-none"
            >
              <Globe size={15} />
              Visit Site
              <ExternalLink size={12} className="opacity-60" />
            </Button>
          )}
          <Button 
            onClick={deploy} 
            disabled={busy}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-5 shadow-lg shadow-indigo-500/10 font-bold transition-all flex items-center gap-2 flex-1 sm:flex-none"
          >
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Play size={15} className="fill-current" />
                Deploy
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Vercel-like Preview and Deployment details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card: Live Browser Viewport Preview */}
          <Card className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden relative">
            {/* Browser Header Accents */}
            <div className="px-4 py-3.5 border-b border-zinc-150 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01] flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-3 h-3 rounded-full bg-red-500/80 border border-red-650/10" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80 border border-yellow-650/10" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-650/10" />
              </div>
              
              {/* Mock Address Bar */}
              <div className="flex-1 max-w-md mx-auto">
                <div className="bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-white/5 rounded-lg py-1 px-4 text-[11px] text-zinc-500 font-mono text-center flex items-center justify-center gap-1 truncate select-all">
                  <Globe size={11} className="shrink-0 text-zinc-400" />
                  {project.subDomain ? `${project.subDomain}.deployr.app` : "localhost:3000"}
                </div>
              </div>

              <div className="w-12 shrink-0" />
            </div>

            {/* Browser Preview Frame */}
            <div className="relative bg-zinc-900 flex items-center justify-center overflow-hidden h-80 border-b border-zinc-150 dark:border-white/5">
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02]" />
              
              {finalLiveUrl && project.status === "READY" ? (
                <iframe
                  src={finalLiveUrl}
                  className="relative z-10 w-full h-full border-0 bg-white pointer-events-auto"
                  title="Live Deployment Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="text-center p-8 z-10 max-w-sm space-y-4">
                  {project.status === "BUILDING" || project.status === "QUEUED" ? (
                    <>
                      <Loader2 size={40} className="text-indigo-500 animate-spin mx-auto" />
                      <div>
                        <h4 className="text-sm font-bold text-white">Generating Website Preview</h4>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                          Your application build is currently compiling in our edge environment. Once ready, the live browser viewport preview will load here.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={36} className="text-zinc-500 mx-auto" />
                      <div>
                        <h4 className="text-sm font-bold text-zinc-400">Preview Unavailable</h4>
                        <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                          No active deployment detected for this project. Trigger a new deployment build above to preview the site.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Active Deployment Details Footer */}
            <div className="p-5 bg-zinc-50/50 dark:bg-white/[0.01] grid sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Deployment Link</span>
                {finalLiveUrl ? (
                  <a 
                    href={finalLiveUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-indigo-500 hover:underline font-semibold block truncate"
                  >
                    {finalLiveUrl}
                  </a>
                ) : (
                  <span className="text-zinc-500 block">Not deployed</span>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Active branch</span>
                <span className="font-mono text-zinc-650 dark:text-zinc-350 block flex items-center gap-1">
                  <GitBranch size={12} />
                  main
                </span>
              </div>
            </div>
          </Card>

          {/* Quick Stats Grid */}
          <div className="grid sm:grid-cols-4 gap-4">
            <Card className="p-5 rounded-2xl border border-zinc-200/50 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-zinc-450 dark:text-zinc-400 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider">Deployments</span>
                <Layers size={16} className="text-indigo-500" />
              </div>
              <p className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none">
                {project.deploymentsCount}
              </p>
            </Card>

            <Card className="p-5 rounded-2xl border border-zinc-200/50 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-zinc-450 dark:text-zinc-400 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider">Deploy Success</span>
                <CheckCircle2 size={16} className="text-emerald-500" />
              </div>
              <p className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none">
                {analytics?.success ?? 0} <span className="text-xs text-zinc-500 font-medium">/ {analytics?.totalDeployments ?? 0}</span>
              </p>
            </Card>

            <Card className="p-5 rounded-2xl border border-zinc-200/50 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-zinc-450 dark:text-zinc-400 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider">Avg Build Duration</span>
                <Clock size={16} className="text-indigo-500" />
              </div>
              <p className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none">
                {formatDuration(analytics?.avgBuildMs)}
              </p>
            </Card>

            <Card className="p-5 rounded-2xl border border-zinc-200/50 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-zinc-450 dark:text-zinc-400 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider">Uptime (24h)</span>
                <Activity size={16} className={uptime?.latest?.up === false ? "text-red-500" : "text-emerald-500"} />
              </div>
              {uptime?.uptimePct !== null && uptime?.uptimePct !== undefined ? (
                <div>
                  <p className="text-2xl font-extrabold text-zinc-900 dark:text-white leading-none">
                    {uptime.uptimePct}%
                  </p>
                  {uptime.latest && (
                    <p className="text-[10px] text-zinc-500 mt-1">
                      {uptime.latest.up
                        ? `${uptime.latest.latencyMs ?? "—"}ms`
                        : "Currently down"}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No data yet</p>
              )}
            </Card>
          </div>
        </div>

        {/* Right Column: Console Actions Panel */}
        <div className="space-y-6">
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
            <h3 className="font-bold text-zinc-900 dark:text-white text-sm mb-4">Console Dashboard</h3>
            
            <div className="flex flex-col gap-2.5">
              
              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/projects/${id}/deployments`)}
                className="w-full justify-start rounded-xl h-11 bg-white/30 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-semibold"
              >
                <Layers size={14} className="mr-2 text-indigo-500" />
                View Deployments list
              </Button>

              <Button
                variant="outline"
                disabled={!project.latestDeploymentId}
                onClick={() => {
                  if (project.latestDeploymentId) {
                    router.push(`/dashboard/logs/${project.latestDeploymentId}`);
                  }
                }}
                className="w-full justify-start rounded-xl h-11 bg-white/30 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                title={!project.latestDeploymentId ? "No active deployments found to view logs for" : undefined}
              >
                <Terminal size={14} className="mr-2 text-indigo-500" />
                Realtime build logs
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/projects/${id}/domains`)}
                className="w-full justify-start rounded-xl h-11 bg-white/30 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-semibold"
              >
                <Globe size={14} className="mr-2 text-indigo-500" />
                Custom domain settings
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/projects/${id}/settings`)}
                className="w-full justify-start rounded-xl h-11 bg-white/30 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-semibold"
              >
                <Settings size={14} className="mr-2 text-indigo-500" />
                Environment variables
              </Button>

              <Button
                onClick={() => router.push(`/dashboard/projects/${id}/insights`)}
                className="w-full justify-start rounded-xl h-11 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-xs font-semibold transition-all"
              >
                <Sparkles size={14} className="mr-2" />
                AI Insights analyzer
              </Button>

              <Button
                onClick={() => router.push(`/dashboard/projects/${id}/analytics`)}
                className="w-full justify-start rounded-xl h-11 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-semibold transition-all"
              >
                <Activity size={14} className="mr-2" />
                Traffic analytics
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/projects/${id}/cron`)}
                className="w-full justify-start rounded-xl h-11 bg-white/30 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-semibold"
              >
                <CalendarClock size={14} className="mr-2 text-indigo-500" />
                Cron jobs
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/projects/${id}/flags`)}
                className="w-full justify-start rounded-xl h-11 bg-white/30 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-semibold"
              >
                <Flag size={14} className="mr-2 text-indigo-500" />
                Feature flags
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/projects/${id}/integrations`)}
                className="w-full justify-start rounded-xl h-11 bg-white/30 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-semibold"
              >
                <Blocks size={14} className="mr-2 text-indigo-500" />
                Integrations marketplace
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/projects/${id}/members`)}
                className="w-full justify-start rounded-xl h-11 bg-white/30 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-semibold"
              >
                <Users size={14} className="mr-2 text-indigo-500" />
                Project access
              </Button>

              <div className="h-[1px] bg-zinc-250 dark:bg-white/5 my-2" />

              <Button
                variant="destructive"
                onClick={async () => {
                  if (!confirm("Delete this project and all its deployments?")) return;
                  try {
                    await api.delete(`/project/${id}`);
                    toast.success("Project deleted successfully.");
                    router.push("/dashboard/projects");
                  } catch {
                    toast.error("Failed to delete project");
                  }
                }}
                className="w-full justify-start rounded-xl h-11 text-xs font-semibold border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-650 dark:text-red-400 border"
              >
                <Trash2 size={14} className="mr-2" />
                Delete Project
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
