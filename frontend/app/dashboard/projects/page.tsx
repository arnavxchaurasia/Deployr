"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Rocket,
  AlertTriangle,
  Loader2,
  FolderGit2,
  GitBranch,
  ArrowUpRight,
  Clock,
  ExternalLink
} from "lucide-react";
import { motion } from "framer-motion";

type Project = {
  id: string;
  name: string;
  slug: string;
  liveUrl: string | null;
  status: "READY" | "QUEUED" | "BUILDING" | "FAILED" | "NOT_DEPLOYED";
  subDomain?: string;
  createdAt: string;
};

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

function StatusBadge({ status }: { status: Project["status"] }) {
  const base = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border";

  switch (status) {
    case "READY":
      return (
        <span className={`${base} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
          Ready
        </span>
      );
    case "BUILDING":
      return (
        <span className={`${base} bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20`}>
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
    case "QUEUED":
      return (
        <span className={`${base} bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20`}>
          <Clock size={10} />
          Queued
        </span>
      );
    default:
      return (
        <span className={`${base} bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20`}>
          Not Deployed
        </span>
      );
  }
}

// Generate a deterministic gradient class based on project name for aesthetic variance
function getProjectGradient(name: string) {
  const gradients = [
    "from-indigo-500/20 to-purple-500/20",
    "from-blue-500/20 to-indigo-500/20",
    "from-purple-500/20 to-pink-500/20",
    "from-emerald-500/20 to-teal-500/20",
    "from-violet-500/20 to-fuchsia-500/20"
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return gradients[sum % gradients.length];
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchProjects() {
    try {
      const res = await api.get("/projects");
      setProjects(res.data.data || []);
    } catch (err) {
      console.error("Fetch projects error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20 animate-fadeIn">
      {/* Header */}
      <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 p-8 rounded-3xl bg-gradient-to-r from-zinc-50 to-zinc-100/50 dark:from-zinc-900/50 dark:to-zinc-950/20 border border-zinc-200/60 dark:border-white/5 overflow-hidden shadow-sm gap-6">
        {/* Decorative background blobs */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 dark:from-white dark:via-zinc-200 dark:to-zinc-400 bg-clip-text text-transparent">
            Projects
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2 font-medium max-w-md">
            Manage your high-performance deployments and track global infrastructure.
          </p>
        </div>

        <Link href="/dashboard/new" className="relative z-10 w-full sm:w-auto">
          <Button className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-12 px-6 shadow-lg shadow-indigo-500/25 font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 border border-indigo-500/50">
            <Plus size={18} />
            New Project
          </Button>
        </Link>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          <div className="h-48 rounded-2xl bg-zinc-200/50 dark:bg-white/5" />
          <div className="h-48 rounded-2xl bg-zinc-200/50 dark:bg-white/5" />
          <div className="h-48 rounded-2xl bg-zinc-200/50 dark:bg-white/5" />
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <Card className="p-12 sm:p-20 rounded-3xl text-center border border-dashed border-zinc-300 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-900/20 backdrop-blur-md shadow-inner flex flex-col items-center justify-center relative overflow-hidden group hover:border-indigo-500/40 transition-colors duration-500">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          
          <div className="relative w-20 h-20 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 flex items-center justify-center mb-6 shadow-xl shadow-black/5 group-hover:shadow-indigo-500/20 transition-all duration-500 group-hover:-translate-y-2 z-10">
            <FolderGit2 size={32} className="text-zinc-400 group-hover:text-indigo-500 transition-colors duration-500" />
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center border border-white dark:border-zinc-900 animate-bounce">
              <Rocket size={14} className="text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-white mb-3 relative z-10">
            No projects yet
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mb-8 relative z-10">
            Connect your GitHub repository and deploy your first highly available application in seconds. Built for speed and scale.
          </p>
          <Link href="/dashboard/new" className="relative z-10">
            <Button className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 rounded-xl px-8 font-bold text-sm h-12 shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
              <Plus size={16} />
              Create your first project
            </Button>
          </Link>
        </Card>
      )}



      {/* Projects grid */}
      {!loading && projects.length > 0 && (
      <motion.div 
        variants={containerVariants} 
        initial="hidden" 
        animate="show" 
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {projects.map(project => (
          <motion.div key={project.id} variants={itemVariants}>
            <Link href={`/dashboard/projects/${project.id}`} className="group block h-full">
              <Card className="h-full rounded-3xl overflow-hidden border border-zinc-200/60 dark:border-white/10 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl shadow-lg relative transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-500/15 hover:border-indigo-500/40 hover:-translate-y-1.5 flex flex-col">
                {/* Visual Cover Banner */}
                <div className={`relative h-28 bg-gradient-to-tr ${getProjectGradient(project.name)} flex items-center justify-center border-b border-zinc-200/50 dark:border-white/5 overflow-hidden shrink-0`}>
                  <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay" />
                  {/* Subtle animated glowing orb behind the icon */}
                  <div className="absolute w-20 h-20 bg-white/30 dark:bg-white/10 rounded-full blur-2xl group-hover:bg-indigo-400/40 transition-colors duration-700" />
                  <FolderGit2 size={36} className="text-zinc-600/80 dark:text-white/60 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500 relative z-10 drop-shadow-sm" />
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div className="min-w-0">
                      <h2 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-300">
                        {project.name}
                      </h2>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mt-1">
                        <GitBranch size={12} className="opacity-70" />
                        <span className="font-mono font-medium tracking-tight">main</span>
                      </div>
                    </div>
                    <div className="scale-95 origin-top-right transition-transform duration-300 group-hover:scale-100 shrink-0">
                      <StatusBadge status={project.status} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between mt-auto">
                    {project.subDomain ? (
                      <a
                        href={`http://localhost:8000/?project=${project.subDomain}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-xs font-semibold text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2 group/link truncate max-w-[180px] transition-colors bg-zinc-50 dark:bg-white/5 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-indigo-500/20"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 group-hover/link:animate-pulse shrink-0" />
                        <span className="truncate">{project.subDomain}.deployr.app</span>
                        <ArrowUpRight size={12} className="opacity-0 -translate-x-2 w-0 overflow-hidden group-hover/link:opacity-100 group-hover/link:translate-x-0 group-hover/link:w-3 transition-all duration-300 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">Not deployed yet</span>
                    )}

                    <span className="text-[11px] text-zinc-400 font-medium bg-zinc-50 dark:bg-white/5 px-2.5 py-1.5 rounded-lg border border-zinc-100 dark:border-white/5 shrink-0">
                      {project.createdAt ? new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ""}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>
      )}
    </div>
  );
}
