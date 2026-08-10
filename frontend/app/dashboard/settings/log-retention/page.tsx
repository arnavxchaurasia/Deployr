"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Archive, Loader2, ChevronDown, Save } from "lucide-react";

type Project = { id: string; name: string };
type RetentionPolicy = {
  retentionDays: number;
  archiveEnabled: boolean;
  archiveBucket: string | null;
  archiveRegion: string | null;
};

export default function LogRetentionPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [retentionDays, setRetentionDays] = useState(30);
  const [archiveEnabled, setArchiveEnabled] = useState(false);
  const [archiveBucket, setArchiveBucket] = useState("");
  const [archiveRegion, setArchiveRegion] = useState("");

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchPolicy = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/project/${id}/log-retention`);
      const p: RetentionPolicy = res.data;
      setRetentionDays(p.retentionDays ?? 30);
      setArchiveEnabled(p.archiveEnabled ?? false);
      setArchiveBucket(p.archiveBucket ?? "");
      setArchiveRegion(p.archiveRegion ?? "");
    } catch {
      setRetentionDays(30);
      setArchiveEnabled(false);
      setArchiveBucket("");
      setArchiveRegion("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchPolicy(selectedId); }, [selectedId, fetchPolicy]);

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.put(`/project/${selectedId}/log-retention`, {
        retentionDays,
        archiveEnabled,
        archiveBucket: archiveEnabled ? archiveBucket.trim() || null : null,
        archiveRegion: archiveEnabled ? archiveRegion.trim() || null : null,
      });
      toast.success("Log retention policy saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  const selectCls = "w-full h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none";

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Log Retention
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Configure how long build and deployment logs are kept and whether to archive them.
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
      ) : (
        <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-6">
          {/* Retention days */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Retention Period</label>
              <p className="text-xs text-zinc-400 mt-0.5">Logs older than this will be deleted (or archived if enabled below).</p>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                className="flex-1 accent-indigo-600"
              />
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => {
                    const v = Math.min(365, Math.max(1, parseInt(e.target.value) || 1));
                    setRetentionDays(v);
                  }}
                  className="w-20 h-9 rounded-xl text-sm text-center font-mono bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
                />
                <span className="text-sm text-zinc-500 whitespace-nowrap">days</span>
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-400 px-0.5">
              <span>1 day</span>
              <span className="font-semibold text-indigo-500">{retentionDays} days selected</span>
              <span>365 days</span>
            </div>
          </div>

          {/* Archive toggle */}
          <div className="pt-2 border-t border-zinc-100 dark:border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Archive size={16} className="text-indigo-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Archive to Storage Bucket</p>
                  <p className="text-xs text-zinc-500">Export expired logs to an S3-compatible bucket before deletion.</p>
                </div>
              </div>
              <Switch checked={archiveEnabled} onCheckedChange={setArchiveEnabled} />
            </div>

            {archiveEnabled && (
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Bucket Name</label>
                  <Input
                    value={archiveBucket}
                    onChange={(e) => setArchiveBucket(e.target.value)}
                    placeholder="my-log-archive-bucket"
                    className="h-9 rounded-xl text-sm bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Region</label>
                  <Input
                    value={archiveRegion}
                    onChange={(e) => setArchiveRegion(e.target.value)}
                    placeholder="us-east-1"
                    className="h-9 rounded-xl text-sm bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-md shadow-indigo-500/10"
          >
            {saving ? <Loader2 size={15} className="animate-spin mr-2" /> : <Save size={15} className="mr-2" />}
            Save Policy
          </Button>
        </Card>
      )}
    </div>
  );
}
