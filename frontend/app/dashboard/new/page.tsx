"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Github, FolderGit2, ArrowRight, Sparkles, AlertTriangle, Link as LinkIcon, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { motion } from "framer-motion";

export default function NewProjectPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [gitURL, setGitURL] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; gitURL?: string }>({});

  async function createProject() {
    if (!session) {
      toast.error("You must be logged in to create a project.");
      router.push("/auth");
      return;
    }

    // Frontend validation
    const schema = z.object({
      name: z.string().min(1, "Project name is required"),
      gitURL: z.string().url("Please enter a valid Git repository URL (e.g., https://github.com/user/repo)"),
    });

    const parsed = schema.safeParse({ name, gitURL });
    if (!parsed.success) {
      const fieldErrors: { name?: string; gitURL?: string } = {};
      parsed.error.issues.forEach((err: any) => {
        if (err.path[0] === "name") fieldErrors.name = err.message;
        if (err.path[0] === "gitURL") fieldErrors.gitURL = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    const loadingToast = toast.loading("Creating project and preparing build environment...");

    try {
      const res = await fetch("http://localhost:9000/project", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, gitURL }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create project", { id: loadingToast });
        return;
      }

      toast.success("Project created successfully!", { id: loadingToast });
      router.push(`/dashboard/projects/${data.data.id}`);
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred. Please try again.", { id: loadingToast });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto pb-20 animate-fadeIn">
      
      {/* Console Top Navigation (matching Dashboard Overview) */}
      <div className="flex items-center gap-6 border-b border-zinc-200 dark:border-white/10 pb-4 mb-8">
        <Link href="/dashboard" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors">
          Overview
        </Link>
        <Link href="#" className="text-sm font-semibold text-zinc-900 dark:text-white border-b-2 border-indigo-500 pb-4 -mb-[17px]">
          Import Project
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-55 dark:to-zinc-400 bg-clip-text text-transparent">
          Let's build something new.
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          To deploy a new Project, connect an existing Git Repository.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Main Import Card */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden relative"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="px-6 py-5 border-b border-zinc-150 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01]">
              <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 text-base">
                <Github size={18} className="text-zinc-800 dark:text-zinc-200" /> 
                Git Repository Configuration
              </h3>
            </div>
            
            <div className="p-6 md:p-8 space-y-6">
              <div className="space-y-6">
                
                {/* Git URL Input */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Repository URL</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                      <LinkIcon size={16} />
                    </span>
                    <Input
                      placeholder="https://github.com/user/repository"
                      value={gitURL}
                      onChange={e => {
                        setGitURL(e.target.value);
                        if (errors.gitURL) setErrors({ ...errors, gitURL: undefined });
                      }}
                      className={`pl-10 h-11 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-xl transition-all focus:ring-2 focus:border-indigo-500 ${
                        errors.gitURL 
                          ? "border-red-500/50 focus:ring-red-500/50" 
                          : "border-zinc-200 dark:border-white/10 focus:ring-indigo-500/50"
                      }`}
                    />
                  </div>
                  {errors.gitURL && (
                    <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                      <AlertTriangle size={12} />
                      {errors.gitURL}
                    </p>
                  )}
                </div>

                {/* Project Name Input */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Project Name</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                      <FolderGit2 size={16} />
                    </span>
                    <Input
                      placeholder="my-awesome-app"
                      value={name}
                      onChange={e => {
                        setName(e.target.value);
                        if (errors.name) setErrors({ ...errors, name: undefined });
                      }}
                      className={`pl-10 h-11 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-xl transition-all focus:ring-2 focus:border-indigo-500 ${
                        errors.name 
                          ? "border-red-500/50 focus:ring-red-500/50" 
                          : "border-zinc-200 dark:border-white/10 focus:ring-indigo-500/50"
                      }`}
                    />
                  </div>
                  {errors.name && (
                    <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                      <AlertTriangle size={12} />
                      {errors.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-white/5 flex items-center gap-2 text-xs text-zinc-500">
                <Sparkles size={14} className="text-indigo-500" />
                <span>Deployr automatically detects your framework (Next.js, Vite, HTML) and configures the optimized build pipeline.</span>
              </div>
            </div>
          </motion.div>

          {/* Out of the box Deploy Button */}
          <div className="mt-8">
            <Button
              onClick={createProject}
              disabled={loading}
              className="w-full relative group overflow-hidden rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base h-14 shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-99 transition-all duration-300 flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.15)_50%,transparent_75%)] translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              <span className="relative flex items-center gap-2">
                {loading ? "Preparing Build environment..." : "Deploy to Edge"}
                {!loading && <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />}
              </span>
            </Button>
          </div>
        </div>

        {/* Sidebar Info Card */}
        <div className="lg:col-span-1">
          <div className="bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md border border-zinc-200/50 dark:border-white/10 rounded-2xl p-6 shadow-xl sticky top-24 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/25">
              <FolderGit2 className="text-indigo-500 animate-pulse" size={20} />
            </div>
            <h4 className="font-bold text-zinc-900 dark:text-white text-sm mb-2">Edge Infrastructure Specs</h4>
            <p className="text-xs text-zinc-650 dark:text-zinc-400 mb-5 leading-relaxed">
              Connect your Git repository and we'll automatically deploy your site to our global edge network. 
              Every push to main will trigger a zero-downtime rolling update.
            </p>
            <ul className="text-xs text-zinc-500 dark:text-zinc-400 space-y-3.5">
              <li className="flex items-center gap-2.5">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Automatic framework detection & caching</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Global POP routing with 250ms cold starts</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Secure HTTPS SSL auto-provisioning</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
