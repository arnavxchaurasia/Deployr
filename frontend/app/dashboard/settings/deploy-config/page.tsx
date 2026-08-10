"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileCode2, ChevronDown, Loader2, CheckCircle2, Play, Upload } from "lucide-react";

type Project = { id: string; name: string };

interface ParsedConfig {
  buildCommand?: string;
  outputDir?: string;
  installCommand?: string;
  framework?: string;
  nodeVersion?: string;
  envVars?: Record<string, string>;
  [key: string]: unknown;
}

export default function DeployConfigPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);

  const [currentConfig, setCurrentConfig] = useState<ParsedConfig | null>(null);
  const [yamlInput, setYamlInput] = useState("");
  const [parsedPreview, setParsedPreview] = useState<ParsedConfig | null>(null);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"))
      .finally(() => setLoadingProjects(false));
  }, []);

  const fetchConfig = useCallback(async (id: string) => {
    setLoadingConfig(true);
    setParsedPreview(null);
    try {
      const res = await api.get(`/project/${id}/deploy-config`);
      setCurrentConfig(res.data ?? null);
      setYamlInput(res.data?.raw ?? res.data?.yaml ?? "");
    } catch {
      setCurrentConfig(null);
      setYamlInput("");
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchConfig(selectedId); }, [selectedId, fetchConfig]);

  async function handleParse() {
    if (!yamlInput.trim()) { toast.error("Enter YAML config first"); return; }
    setParsing(true);
    setParsedPreview(null);
    try {
      const res = await api.post("/deploy-config/parse", { yaml: yamlInput });
      setParsedPreview(res.data ?? {});
      toast.success("Config parsed successfully");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to parse config");
    } finally {
      setParsing(false);
    }
  }

  async function handleApply() {
    if (!selectedId) return;
    if (!yamlInput.trim()) { toast.error("Enter YAML config first"); return; }
    setApplying(true);
    try {
      await api.post("/deploy-config/apply", { projectId: selectedId, yaml: yamlInput });
      toast.success("Deploy config applied to project");
      await fetchConfig(selectedId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to apply config");
    } finally {
      setApplying(false);
    }
  }

  const selectCls =
    "w-full h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none";

  const configFields: { key: keyof ParsedConfig; label: string }[] = [
    { key: "framework", label: "Framework" },
    { key: "buildCommand", label: "Build Command" },
    { key: "outputDir", label: "Output Directory" },
    { key: "installCommand", label: "Install Command" },
    { key: "nodeVersion", label: "Node Version" },
  ];

  return (
    <div className="max-w-3xl space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Deploy Config
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Edit and apply your <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">deployr.yml</code> configuration to a project.
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
            disabled={loadingProjects}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
      </Card>

      {/* Current config (read-only) */}
      {currentConfig && !loadingConfig && (
        <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-500" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Current Config</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {configFields.map(({ key, label }) =>
              currentConfig[key] ? (
                <div key={key} className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300">{String(currentConfig[key])}</p>
                </div>
              ) : null
            )}
          </div>
        </Card>
      )}

      {/* Editor */}
      <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
            <FileCode2 size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Edit deployr.yml</h3>
            <p className="text-xs text-zinc-500">Paste or edit your config, then parse to preview before applying.</p>
          </div>
        </div>

        {loadingConfig ? (
          <div className="flex justify-center py-8">
            <Loader2 size={22} className="animate-spin text-zinc-400" />
          </div>
        ) : (
          <textarea
            rows={14}
            value={yamlInput}
            onChange={(e) => { setYamlInput(e.target.value); setParsedPreview(null); }}
            placeholder={`framework: nextjs\nbuildCommand: npm run build\noutputDir: .next\ninstallCommand: npm ci\nnodeVersion: "20"`}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-900/50 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
            spellCheck={false}
          />
        )}

        {/* Parsed preview */}
        {parsedPreview && (
          <div className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5 rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Parsed Preview</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {Object.entries(parsedPreview)
                .filter(([, v]) => typeof v === "string" || typeof v === "number")
                .map(([k, v]) => (
                  <div key={k} className="flex gap-2 items-start">
                    <span className="text-xs text-zinc-400 font-mono min-w-[8rem] shrink-0">{k}</span>
                    <span className="text-xs text-zinc-700 dark:text-zinc-300 font-mono break-all">{String(v)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleParse}
            disabled={parsing || !yamlInput.trim()}
            className="flex-1 h-11 rounded-xl border-zinc-200 dark:border-white/10 font-semibold"
          >
            {parsing ? <Loader2 size={16} className="animate-spin mr-2" /> : <Play size={15} className="mr-2" />}
            Parse
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || !yamlInput.trim() || !selectedId}
            className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/10"
          >
            {applying ? <Loader2 size={16} className="animate-spin mr-2" /> : <Upload size={15} className="mr-2" />}
            Apply
          </Button>
        </div>
      </Card>
    </div>
  );
}
