"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield, Plus, Trash2, Loader2, AlertTriangle, ChevronDown,
} from "lucide-react";

type Project = { id: string; name: string };
type CidrEntry = { id: string; cidr: string; label: string | null };
type AllowlistPolicy = { enabled: boolean; entries: CidrEntry[] };

export default function IpAllowlistPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AllowlistPolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [newCidr, setNewCidr] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const res = await api.get(`/project/${id}/ip-allowlist`);
      setPolicy(res.data);
    } catch {
      setPolicy({ enabled: false, entries: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchPolicy(selectedId); }, [selectedId, fetchPolicy]);

  async function handleToggle(enabled: boolean) {
    if (!selectedId) return;
    setToggling(true);
    try {
      const res = await api.patch(`/project/${selectedId}/ip-allowlist`, { enabled });
      setPolicy((p) => p ? { ...p, enabled: res.data?.enabled ?? enabled } : p);
      toast.success(enabled ? "IP allowlist enabled" : "IP allowlist disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update setting");
    } finally {
      setToggling(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !newCidr.trim()) return;
    setAdding(true);
    try {
      const res = await api.post(`/project/${selectedId}/ip-allowlist/entries`, {
        cidr: newCidr.trim(),
        label: newLabel.trim() || null,
      });
      setPolicy((p) => p ? { ...p, entries: [...p.entries, res.data] } : p);
      setNewCidr("");
      setNewLabel("");
      toast.success("CIDR entry added");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add entry");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (!selectedId) return;
    setDeletingId(entryId);
    try {
      await api.delete(`/project/${selectedId}/ip-allowlist/entries/${entryId}`);
      setPolicy((p) => p ? { ...p, entries: p.entries.filter((e) => e.id !== entryId) } : p);
      toast.success("Entry removed");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to remove entry");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          IP Allowlist
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Restrict project access to specific IP ranges. All other IPs will be blocked when enabled.
        </p>
      </div>

      {/* Project selector */}
      <div className="relative w-64">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full appearance-none h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-3 text-zinc-400 pointer-events-none" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
      ) : policy ? (
        <div className="space-y-6">
          {/* Toggle card */}
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Enable IP Allowlisting</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  When on, only the CIDRs listed below can access this project.
                </p>
              </div>
              <Switch
                checked={policy.enabled}
                onCheckedChange={handleToggle}
                disabled={toggling}
              />
            </div>

            {policy.enabled && (
              <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  IP allowlisting is <strong>active</strong>. All IPs not listed below will be blocked from accessing deployments for this project.
                </p>
              </div>
            )}
          </Card>

          {/* Entries table */}
          <Card className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden">
            <div className="p-5 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2">
              <Shield size={16} className="text-indigo-500" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">CIDR Entries</h3>
              <Badge variant="secondary" className="ml-auto text-xs">{policy.entries.length}</Badge>
            </div>

            {policy.entries.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No CIDR entries yet. Add one below.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.02]">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">CIDR</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Label</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                  {policy.entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 font-mono text-zinc-800 dark:text-zinc-200">{entry.cidr}</td>
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{entry.label ?? <span className="italic opacity-50">—</span>}</td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(entry.id)}
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
            )}

            {/* Add form */}
            <form onSubmit={handleAdd} className="p-5 border-t border-zinc-100 dark:border-white/5 flex gap-3 flex-wrap">
              <Input
                placeholder="e.g. 203.0.113.0/24"
                value={newCidr}
                onChange={(e) => setNewCidr(e.target.value)}
                className="flex-1 min-w-40 h-9 rounded-xl text-sm font-mono bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
              />
              <Input
                placeholder="Label (optional)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="flex-1 min-w-32 h-9 rounded-xl text-sm bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
              />
              <Button
                type="submit"
                disabled={adding || !newCidr.trim()}
                className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} className="mr-1.5" />Add</>}
              </Button>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
