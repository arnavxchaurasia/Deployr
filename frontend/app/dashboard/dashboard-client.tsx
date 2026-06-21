"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderGit2,
  Rocket,
  Clock,
  Plus,
  Activity,
  ArrowUpRight,
  Server,
  TerminalSquare,
  Globe2,
  GitBranch,
  Github,
  CheckCircle2,
  AlertCircle,
  Search,
  BookOpen,
  Sparkles,
  ArrowRight
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip
} from "recharts";

/* ------------------------------------
   Helpers
   ------------------------------------ */
function formatDuration(ms?: number | null): string {
  if (ms === null || ms === undefined || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

function timeAgo(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
}

type Analytics = {
  avgMs: number | null;
  deploymentsCount: number;
  trend: { date: string; avgMs: number }[];
  totalRequests: number;
  successRate: number;
  cacheHitRate: number;
  avgLatencyMs: number;
};

type Deployment = {
  id: string;
  status: string;
  createdAt: string;
};

type Project = {
  id: string;
  name: string;
  gitURL: string;
  subDomain: string;
  createdAt: string;
  deployments?: Deployment[];
};

/* ------------------------------------
   Animation Variants
   ------------------------------------ */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 20 } }
};

export default function DashboardOverview({
  initialProjects,
  initialAnalytics,
}: {
  initialProjects: Project[];
  initialAnalytics: Analytics | null;
}) {
  const [projects] = useState<Project[]>(initialProjects || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [analytics] = useState<Analytics | null>(initialAnalytics);
  const router = useRouter();

  const safeAnalytics = analytics ?? { avgMs: null, deploymentsCount: 0, trend: [], totalRequests: 0, successRate: 0, cacheHitRate: 0, avgLatencyMs: 0 };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.subDomain || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full max-w-7xl mx-auto pb-20 animate-fadeIn">
      
      {/* Console Top Navigation */}
      <div className="flex items-center gap-6 border-b border-zinc-200 dark:border-white/10 pb-4 mb-8 overflow-x-auto scrollbar-none">
        <Link href="/dashboard" className="text-sm font-semibold text-zinc-900 dark:text-white border-b-2 border-indigo-500 pb-4 -mb-[17px] whitespace-nowrap">
          Overview
        </Link>
        <Link href="/dashboard/integrations" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors whitespace-nowrap">
          Integrations
        </Link>
        <Link href="/dashboard/activity" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors whitespace-nowrap">
          Activity
        </Link>
        <Link href="/dashboard/domains" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors whitespace-nowrap">
          Domains
        </Link>
        <Link href="/dashboard/usage" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors whitespace-nowrap">
          Usage
        </Link>
      </div>

      {/* Header Panel */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
            Overview
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Monitor and launch applications globally on our PaaS cloud network.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/docs">
            <Button variant="outline" className="bg-white/50 dark:bg-black/20 border-zinc-200 dark:border-white/10 rounded-xl h-11 px-4 text-xs font-semibold flex items-center gap-2">
              <BookOpen size={15} />
              Documentation
            </Button>
          </Link>
          <Link href="/dashboard/new">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-5 shadow-lg shadow-indigo-500/10 font-bold transition-all flex items-center gap-2">
              <Plus size={16} />
              New Project
            </Button>
          </Link>
        </div>
      </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: Projects & Metrics */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Top Metric Cards */}
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              
              {/* Card: Total Projects */}
              <motion.div variants={itemVariants} className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-3">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <FolderGit2 size={16} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Total Projects</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none">{projects.length}</span>
                  <span className="text-[10px] text-zinc-400 font-medium">Deploys ready</span>
                </div>
              </motion.div>

              {/* Card: Deployments count */}
              <motion.div variants={itemVariants} className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-3">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Rocket size={16} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Deployments</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none">{safeAnalytics.deploymentsCount}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Active
                  </span>
                </div>
              </motion.div>

              {/* Card: Edge Requests Chart metric */}
              <motion.div variants={itemVariants} className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl p-5 shadow-xl overflow-hidden relative group hover:border-indigo-500/30 transition-all duration-300">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-3 relative z-10">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Activity size={16} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Edge Requests</span>
                </div>
                <div className="flex items-end gap-1.5 relative z-10">
                  <span className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none">
                    {safeAnalytics.totalRequests >= 1000 ? (safeAnalytics.totalRequests / 1000).toFixed(1) + 'k' : safeAnalytics.totalRequests}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-medium pb-0.5">/mo</span>
                </div>
                {/* Tiny sparkline background */}
                <div className="absolute inset-x-0 bottom-0 h-10 opacity-20 pointer-events-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={safeAnalytics.trend}>
                      <Area type="monotone" dataKey="avgMs" stroke="#6366f1" fill="#6366f1" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Card: Success Rate */}
              <motion.div variants={itemVariants} className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-3">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <CheckCircle2 size={16} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Success Rate</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none">{safeAnalytics.successRate}%</span>
                  <span className="text-[10px] text-zinc-400 font-medium">HTTP 2xx & 3xx</span>
                </div>
              </motion.div>

              {/* Card: Cache Hit Rate */}
              <motion.div variants={itemVariants} className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-3">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Server size={16} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Cache Hit Rate</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none">{safeAnalytics.cacheHitRate}%</span>
                  <span className="text-[10px] text-zinc-400 font-medium">Edge Served</span>
                </div>
              </motion.div>

              {/* Card: Avg Latency */}
              <motion.div variants={itemVariants} className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-3">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Clock size={16} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Avg Latency</span>
                </div>
                <div className="flex items-end gap-1.5">
                  <span className="text-3xl font-extrabold text-zinc-900 dark:text-white leading-none">{safeAnalytics.avgLatencyMs}</span>
                  <span className="text-[11px] text-zinc-400 font-medium pb-0.5">ms</span>
                </div>
              </motion.div>

            </motion.div>

            {/* Active Projects Card */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.15 }} 
              className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-zinc-150 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white text-base">Active Projects</h3>
                  <p className="text-xs text-zinc-500">Your hosted apps and Git repositories.</p>
                </div>
                
                {/* Search input */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Search size={15} />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Search projects..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="text-xs bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder-zinc-400"
                  />
                </div>
              </div>
              
              {filteredProjects.length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center mb-4">
                    <FolderGit2 size={28} className="text-zinc-400" />
                  </div>
                  <h4 className="text-base font-bold text-zinc-900 dark:text-white mb-1">
                    {searchQuery ? "No matching projects found" : "No projects deployed yet"}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-6 leading-relaxed">
                    {searchQuery ? "Try refining your search terms." : "Connect a GitHub repository to trigger your first global edge deployment in seconds."}
                  </p>
                  <Link href="/dashboard/new">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 font-semibold text-xs h-10 shadow-md shadow-indigo-500/10">
                      Import Repository
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/30 uppercase border-b border-zinc-150 dark:border-white/5 tracking-wider font-bold">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Project Name</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold">Production URL</th>
                        <th className="px-6 py-4 font-semibold text-right">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150 dark:divide-white/5">
                      {filteredProjects.map((project) => (
                        <tr 
                          key={project.id} 
                          onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                          className="hover:bg-zinc-100/30 dark:hover:bg-white/[0.01] transition-colors group cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border border-zinc-200 dark:border-white/10 group-hover:scale-105 transition-transform">
                                <Github size={16} className="text-zinc-700 dark:text-zinc-300" />
                              </div>
                              <div>
                                <Link 
                                  href={`/dashboard/projects/${project.id}`}
                                  className="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                                >
                                  {project.name}
                                </Link>
                                <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-0.5">
                                  <GitBranch size={11} />
                                  <span className="font-mono">main</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                              Ready
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <a 
                              href={`http://localhost:8000/?project=${project.subDomain}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-xs text-zinc-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:underline flex items-center gap-1 group/link"
                            >
                              {project.subDomain}.deployr.app
                              <ArrowUpRight size={12} className="opacity-0 group-hover/link:opacity-100 transition-opacity" />
                            </a>
                          </td>
                          <td className="px-6 py-4 text-right text-xs text-zinc-500 whitespace-nowrap">
                            {new Date(project.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>

          </div>

          {/* Right Sidebar: Activity & Limits */}
          <motion.div 
            initial={{ opacity: 0, x: 15 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ delay: 0.25 }} 
            className="space-y-6"
          >
            
            {/* Card: Recent Activity */}
            <div className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-150 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01]">
                <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Recent Activity</h3>
              </div>
              <div className="p-5">
                <div className="space-y-6">
                  {(() => {
                    const realActivity = projects.flatMap(p => 
                      (p.deployments || []).map(d => ({
                        id: d.id,
                        type: "deploy",
                        project: p.name,
                        status: d.status === "READY" ? "success" : d.status === "FAILED" ? "failed" : "info",
                        timestamp: new Date(d.createdAt).getTime(),
                        time: timeAgo(new Date(d.createdAt)),
                        branch: "main",
                        hash: d.id.substring(0, 7),
                      }))
                    ).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);

                    if (realActivity.length === 0) {
                      return (
                        <div className="text-center py-6 text-zinc-500 text-xs">
                          No recent deployment history found.
                        </div>
                      );
                    }

                    return realActivity.map((activity, i) => (
                      <div key={activity.id} className="flex gap-4 relative">
                        {i !== realActivity.length - 1 && (
                          <div className="absolute top-6 left-2.5 w-[1px] h-[calc(100%+8px)] bg-zinc-200 dark:bg-white/10" />
                        )}
                      
                      <div className="relative z-10 w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-white dark:bg-zinc-950">
                        {activity.status === "success" && <CheckCircle2 size={16} className="text-emerald-500" />}
                        {activity.status === "failed" && <AlertCircle size={16} className="text-red-500" />}
                        {activity.status === "info" && <TerminalSquare size={14} className="text-zinc-400" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                          Production Deployment
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
                          <span className="font-bold text-zinc-650 dark:text-zinc-300 truncate">{activity.project}</span>
                          <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                          <span>{activity.time}</span>
                        </p>
                        {activity.type === "deploy" && (
                          <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/5 text-[10px] text-zinc-500 font-mono">
                            <GitBranch size={10} />
                            {activity.branch}
                            <span className="text-zinc-400 dark:text-zinc-600">({activity.hash})</span>
                          </div>
                        )}
                      </div>
                    </div>
                    ));
                  })()}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-zinc-150 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01]">
                <Link href="/dashboard/projects">
                  <button className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 w-full text-center uppercase tracking-wider transition-colors">
                    View All Activity
                  </button>
                </Link>
              </div>
            </div>

            {/* Card: Pro Plan Limits */}
            {(() => {
              const depsCount = safeAnalytics.deploymentsCount;
              const invocations = safeAnalytics.totalRequests || 0;
              
              // Compute Edge Bandwidth based on invocations (assume avg 14.2 KB per request)
              const bandwidthGb = ((invocations * 14.2) / 1024 / 1024).toFixed(3);
              const bandwidthPercent = Math.min((parseFloat(bandwidthGb) / 100) * 100, 100);
              const invocationsPercent = Math.min((invocations / 1000000) * 100, 100);
              
              return (
                <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-black rounded-2xl p-6 shadow-xl border border-zinc-800 text-white relative overflow-hidden group">
                  <div className="absolute top-[-50%] right-[-10%] w-[80%] h-[150%] bg-indigo-500/10 blur-[50px] pointer-events-none group-hover:bg-indigo-500/15 transition-all duration-500" />
                  <div className="flex items-center justify-between mb-5 relative z-10">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={16} className="text-indigo-400" />
                      <h3 className="font-bold text-sm tracking-tight">Pro Plan</h3>
                    </div>
                    <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-md">
                      Active
                    </span>
                  </div>
                  <div className="space-y-4 relative z-10">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-zinc-400">Edge Bandwidth</span>
                        <span className="font-semibold text-zinc-200">{bandwidthGb} GB / 100 GB</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-1000" 
                          style={{ width: `${bandwidthPercent}%` }} 
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-zinc-400">Serverless Invocations</span>
                        <span className="font-semibold text-zinc-200">{invocations.toLocaleString()} / 1.0M</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-1000" 
                          style={{ width: `${invocationsPercent}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                  <Link href="/dashboard/billing">
                    <Button className="w-full mt-6 bg-white hover:bg-zinc-200 text-black rounded-xl h-10 font-bold transition-all relative z-10 shadow-lg text-xs">
                      Upgrade Limits
                    </Button>
                  </Link>
                </div>
              );
            })()}

          </motion.div>
        </div>
    </div>
  );
}
