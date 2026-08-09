"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Github, FolderGit2, ArrowRight, Sparkles, AlertTriangle, Link as LinkIcon, CheckCircle2, Layers, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { motion } from "framer-motion";

type Template = { id: string; name: string; description: string; gitURL: string; tag: string };

const TEMPLATES: Template[] = [
  {
    id: "next-portfolio",
    name: "Next.js Portfolio",
    description: "Vercel's official Next.js App Router portfolio starter.",
    gitURL: "https://github.com/vercel/nextjs-portfolio-starter",
    tag: "Next.js",
  },
  {
    id: "next-shadcn",
    name: "Next.js + shadcn/ui",
    description: "Next.js with Tailwind CSS and shadcn/ui components pre-configured.",
    gitURL: "https://github.com/shadcn-ui/next-template",
    tag: "Next.js",
  },
  {
    id: "svelte",
    name: "Svelte",
    description: "The classic minimal Svelte starter template.",
    gitURL: "https://github.com/sveltejs/template",
    tag: "Svelte",
  },
  {
    id: "remix-indie",
    name: "Remix Indie Stack",
    description: "A full-stack Remix starter with auth and a database ready to go.",
    gitURL: "https://github.com/remix-run/indie-stack",
    tag: "Remix",
  },
  {
    id: "static-html",
    name: "Static HTML5",
    description: "A dependency-free, framework-agnostic static site boilerplate.",
    gitURL: "https://github.com/h5bp/html5-boilerplate",
    tag: "Static",
  },
];

export default function NewProjectPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [gitURL, setGitURL] = useState("");
  const [rootDir, setRootDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; gitURL?: string }>({});
  const [monorepo, setMonorepo] = useState<{ isMonorepo: boolean; type: string | null } | null>(null);
  const [detectingMonorepo, setDetectingMonorepo] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  function useTemplate(template: Template) {
    setSelectedTemplateId(template.id);
    setGitURL(template.gitURL);
    setName(template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    setErrors({});
    detectFromUrl(template.gitURL);
  }

  async function detectFromUrl(url: string) {
    // Parse owner/repo from a GitHub https URL
    const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
    if (!match) return;
    const [, owner, repo] = match;
    setDetectingMonorepo(true);
    try {
      const res = await fetch(
        `http://localhost:9000/github/detect?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setMonorepo({ isMonorepo: data.isMonorepo ?? false, type: data.monoRepoType ?? null });
      }
    } catch {
      // silently ignore — detection is best-effort
    } finally {
      setDetectingMonorepo(false);
    }
  }

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
        body: JSON.stringify({ name, gitURL, ...(rootDir.trim() ? { rootDir: rootDir.trim() } : {}) }),
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

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2 mb-3">
          <LayoutTemplate size={16} className="text-indigo-500" />
          Start from a template
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => useTemplate(t)}
              className={`text-left p-4 rounded-xl border transition-all ${
                selectedTemplateId === t.id
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                  : "border-zinc-200 dark:border-white/10 bg-white/40 dark:bg-zinc-950/40 hover:border-indigo-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">{t.name}</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{t.tag}</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">{t.description}</p>
            </button>
          ))}
        </div>
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
                        if (monorepo) setMonorepo(null);
                      }}
                      onBlur={e => detectFromUrl(e.target.value)}
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
                  {detectingMonorepo && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1 mt-1">
                      <Layers size={12} className="animate-pulse" />
                      Detecting monorepo structure...
                    </p>
                  )}
                </div>

                {/* Monorepo banner + root dir input */}
                {monorepo?.isMonorepo && (
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <Layers size={15} className="text-indigo-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-indigo-300 leading-relaxed">
                        <span className="font-semibold text-indigo-200">
                          {monorepo.type === "turborepo" ? "Turborepo" : monorepo.type === "nx" ? "nx" : "pnpm workspace"} detected.
                        </span>{" "}
                        Set the Root Directory to the sub-app you want to deploy, e.g.{" "}
                        <code className="font-mono bg-indigo-500/20 px-1 rounded">apps/web</code>.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Root Directory</label>
                      <Input
                        placeholder="apps/web"
                        value={rootDir}
                        onChange={e => setRootDir(e.target.value)}
                        className="h-9 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-xl border-zinc-200 dark:border-white/10 text-sm font-mono"
                      />
                    </div>
                  </div>
                )}

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
