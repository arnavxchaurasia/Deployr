"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, Trash2, Loader2, ChevronDown, RefreshCw } from "lucide-react";

type Project = { id: string; name: string };
type CacheEntry = {
  id: string;
  key: string;
  sizeBytes: number;
  hitCount: number;
  lastUsedAt: string;
};
type CacheStats = {
  totalEntries: number;
  totalSizeBytes: number;
  totalHits: number;
  entries: CacheEntry[];
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BuildCachePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [invalidating, setInvalidating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchStats = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/project/${id}/build-cache`);
      setStats(res.data);
    } catch {
      setStats({ totalEntries: 0, totalSizeBytes: 0, totalHits: 0, entries: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchStats(selectedId); }, [selectedId, fetchStats]);

  async function handleInvalidateAll() {
    if (!selectedId) return;
    if (!confirm("Invalidate all cache entries for this project? This cannot be undone.")) return;
    setInvalidating(true);
    try {
      await api.delete(`/project/${selectedId}/build-cache`);
      setStats((s) => s ? { ...s, totalEntries: 0, totalSizeBytes: 0, entries: [] } : s);
      toast.success("All cache entries invalidated");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to invalidate cache");
    } finally {
      setInvalidating(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    if (!selectedId) return;
    setDeletingId(entryId);
    try {
      await api.delete(`/project/${selectedId}/build-cache/${entryId}`);
      setStats((s) => s ? {
        ...s,
        totalEntries: s.totalEntries - 1,
        entries: s.entries.filter((e) => e.id !== entryId),
      } : s);
      toast.success("Cache entry deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete entry");
    } finally {
      setDeletingId(null);
    }
  }

  const selectCls = "h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none w-64";

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Build Cache
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          View and manage cached build artifacts to speed up deployments.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative">
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className={selectCls}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3 text-zinc-400 pointer-events-none" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => selectedId && fetchStats(selectedId)} className="h-9 rounded-xl text-sm">
            <RefreshCw size={14} className="mr-1.5" />Refresh
          </Button>
          <Button
            variant="destructive"
            onClick={handleInvalidateAll}
            disabled={invalidating || !stats?.totalEntries}
            className="h-9 rounded-xl text-sm bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            {invalidating ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Trash2 size={14} className="mr-1.5" />}
            Invalidate All
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Entries", value: stats.totalEntries.toLocaleString() },
              { label: "Total Size", value: formatSize(stats.totalSizeBytes) },
              { label: "Total Hits", value: stats.totalHits.toLocaleString() },
            ].map((s) => (
              <Card key={s.label} className="p-5 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{s.label}</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1 font-mono">{s.value}</p>
              </Card>
            ))}
          </div>

          {/* Entries table */}
          <Card className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden">
            <div className="p-5 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2">
              <Zap size={16} className="text-indigo-500" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Cache Entries</h3>
            </div>

            {stats.entries.length === 0 ? (
              <div className="p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No cache entries found for this project.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.02]">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Key</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Size</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Hits</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Last Used</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                    {stats.entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300 max-w-xs">
                          <span className="truncate block" title={entry.key}>{entry.key.length > 48 ? entry.key.slice(0, 48) + "…" : entry.key}</span>
                        </td>
                        <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatSize(entry.sizeBytes)}</td>
                        <td className="px-5 py-3">
                          <Badge variant="secondary" className="font-mono text-xs">{entry.hitCount}</Badge>
                        </td>
                        <td className="px-5 py-3 text-zinc-500 whitespace-nowrap text-xs">{formatRelative(entry.lastUsedAt)}</td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEntry(entry.id)}
                            disabled={deletingId === entry.id}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            {deletingId === entry.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
