"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FolderTree, Search, CheckCircle2, X, Loader2, ChevronDown } from "lucide-react";

type Project = { id: string; name: string; monorepoRoot: string | null };
type DetectResult = { candidates: string[] };

export default function MonorepoPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [settingRoot, setSettingRoot] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) {
        setSelectedId(list[0].id);
        setCurrentProject(list[0]);
      }
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/project/${id}`);
      setCurrentProject(res.data);
    } catch {
      const p = projects.find((p) => p.id === id) ?? null;
      setCurrentProject(p);
    } finally {
      setLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    if (selectedId) {
      setCandidates(null);
      fetchProject(selectedId);
    }
  }, [selectedId, fetchProject]);

  async function handleDetect() {
    if (!selectedId) return;
    setDetecting(true);
    setCandidates(null);
    try {
      const res = await api.post(`/project/${selectedId}/monorepo/detect`, {});
      const data: DetectResult = res.data;
      setCandidates(data.candidates ?? []);
      if (!data.candidates?.length) toast.info("No workspace candidates found");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Detection failed");
    } finally {
      setDetecting(false);
    }
  }

  async function handleSetRoot(path: string) {
    if (!selectedId) return;
    setSettingRoot(path);
    try {
      await api.patch(`/project/${selectedId}`, { monorepoRoot: path });
      setCurrentProject((p) => p ? { ...p, monorepoRoot: path } : p);
      setProjects((ps) => ps.map((p) => p.id === selectedId ? { ...p, monorepoRoot: path } : p));
      setCandidates(null);
      toast.success(`Monorepo root set to ${path}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to set root");
    } finally {
      setSettingRoot(null);
    }
  }

  async function handleClear() {
    if (!selectedId) return;
    setClearing(true);
    try {
      await api.patch(`/project/${selectedId}`, { monorepoRoot: null });
      setCurrentProject((p) => p ? { ...p, monorepoRoot: null } : p);
      setProjects((ps) => ps.map((p) => p.id === selectedId ? { ...p, monorepoRoot: null } : p));
      toast.success("Monorepo root cleared");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to clear root");
    } finally {
      setClearing(false);
    }
  }

  const selectCls = "h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none w-64";

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Monorepo Configuration
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Set the workspace root for monorepo projects. Deployr will scope builds to this directory.
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
      ) : currentProject ? (
        <div className="space-y-5">
          {/* Current root status */}
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <FolderTree size={18} className="text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Current Root</p>
                  {currentProject.monorepoRoot ? (
                    <p className="font-mono text-sm text-indigo-600 dark:text-indigo-400 mt-0.5">{currentProject.monorepoRoot}</p>
                  ) : (
                    <p className="text-xs text-zinc-500 mt-0.5 italic">Not configured — building from repository root</p>
                  )}
                </div>
              </div>
              {currentProject.monorepoRoot && (
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold shrink-0">
                  <CheckCircle2 size={11} className="mr-1" />Configured
                </Badge>
              )}
            </div>

            {currentProject.monorepoRoot && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={clearing}
                className="mt-4 h-8 rounded-lg text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
              >
                {clearing ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <X size={12} className="mr-1.5" />}
                Clear root
              </Button>
            )}
          </Card>

          {/* Detect */}
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Detect Workspace</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Scan the repository for package.json workspaces, pnpm-workspace.yaml, or Turborepo configs.</p>
              </div>
              <Button
                onClick={handleDetect}
                disabled={detecting}
                className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shrink-0"
              >
                {detecting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Search size={14} className="mr-1.5" />}
                Detect
              </Button>
            </div>

            {candidates !== null && (
              <div className="mt-4">
                {candidates.length === 0 ? (
                  <p className="text-sm text-zinc-500 italic">No workspace candidates found in the repository.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{candidates.length} candidate{candidates.length !== 1 ? "s" : ""} found</p>
                    {candidates.map((path) => (
                      <div key={path} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/50 dark:border-white/5">
                        <span className="font-mono text-sm text-zinc-800 dark:text-zinc-200">{path}</span>
                        <Button
                          size="sm"
                          onClick={() => handleSetRoot(path)}
                          disabled={settingRoot === path || currentProject.monorepoRoot === path}
                          className="h-7 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                        >
                          {settingRoot === path ? <Loader2 size={12} className="animate-spin" /> : currentProject.monorepoRoot === path ? "Selected" : "Use this"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
