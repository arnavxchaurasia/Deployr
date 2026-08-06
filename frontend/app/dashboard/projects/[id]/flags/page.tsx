"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Flag, Plus, Trash2, ArrowLeft, Loader2, Copy } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type FeatureFlag = {
  id: string;
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  createdAt: string;
};

export default function FeatureFlagsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newKey, setNewKey] = useState("");

  const fetchFlags = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/flags`);
      setFlags(res.data);
    } catch {
      toast.error("Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim()) return;
    setCreating(true);
    try {
      await api.post(`/project/${id}/flags`, { key: newKey.trim(), enabled: false, rolloutPercent: 100 });
      toast.success("Flag created");
      setNewKey("");
      await fetchFlags();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create flag");
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(flag: FeatureFlag) {
    setSavingId(flag.id);
    try {
      await api.post(`/project/${id}/flags`, { key: flag.key, enabled: !flag.enabled, rolloutPercent: flag.rolloutPercent });
      setFlags(prev => prev.map(f => (f.id === flag.id ? { ...f, enabled: !f.enabled } : f)));
    } catch {
      toast.error("Failed to update flag");
    } finally {
      setSavingId(null);
    }
  }

  async function updateRollout(flag: FeatureFlag, rolloutPercent: number) {
    setFlags(prev => prev.map(f => (f.id === flag.id ? { ...f, rolloutPercent } : f)));
  }

  async function saveRollout(flag: FeatureFlag) {
    setSavingId(flag.id);
    try {
      await api.post(`/project/${id}/flags`, { key: flag.key, enabled: flag.enabled, rolloutPercent: flag.rolloutPercent });
      toast.success("Rollout saved");
    } catch {
      toast.error("Failed to save rollout");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(flagId: string) {
    if (!confirm("Delete this feature flag?")) return;
    setDeletingId(flagId);
    try {
      await api.delete(`/project/${id}/flags/${flagId}`);
      setFlags(prev => prev.filter(f => f.id !== flagId));
      toast.success("Flag deleted");
    } catch {
      toast.error("Failed to delete flag");
    } finally {
      setDeletingId(null);
    }
  }

  function copyEndpoint() {
    navigator.clipboard.writeText(`${API}/flags/${id}`);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="text-indigo-500" size={24} />
            Feature Flags
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Toggle features on/off and roll them out gradually, without a redeploy.
          </p>
        </div>
      </div>

      <Card className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Copy size={15} className="text-indigo-500" />
          Evaluation endpoint
        </h2>
        <p className="text-xs text-zinc-500">
          Call this from your app (server or client) to get the current flag values. Pass{" "}
          <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">?userId=…</code> for
          stable per-user rollout bucketing.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg overflow-x-auto block">
            GET {API}/flags/{id}
          </code>
          <Button variant="outline" size="icon" onClick={copyEndpoint}>
            <Copy size={14} />
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Plus size={16} className="text-indigo-500" />
          Add Flag
        </h2>
        <form onSubmit={handleCreate} className="flex gap-3">
          <Input
            placeholder="e.g. new-checkout-flow"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            className="font-mono"
          />
          <Button type="submit" disabled={creating || !newKey.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
            {creating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} className="mr-2" />}
            {creating ? "Creating…" : "Create"}
          </Button>
        </form>
      </Card>

      <div>
        <h2 className="text-base font-semibold mb-4">Flags</h2>
        {loading ? (
          <div className="p-10 text-center text-zinc-500">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : flags.length === 0 ? (
          <div className="p-14 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-2xl text-center">
            <Flag size={36} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-500">No feature flags yet</p>
            <p className="text-xs text-zinc-400 mt-1">Create one above to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {flags.map(flag => (
              <Card key={flag.id} className="p-4 flex items-center gap-4 flex-wrap">
                <code className="font-mono text-sm font-semibold flex-1 min-w-[140px]">{flag.key}</code>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={flag.rolloutPercent}
                    onChange={e => updateRollout(flag, Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                    onBlur={() => saveRollout(flag)}
                    className="w-20 text-sm font-mono"
                  />
                  <span className="text-xs text-zinc-400">% rollout</span>
                </div>
                <Button
                  variant={flag.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEnabled(flag)}
                  disabled={savingId === flag.id}
                  className="shrink-0"
                >
                  {savingId === flag.id ? <Loader2 size={13} className="animate-spin" /> : flag.enabled ? "Enabled" : "Disabled"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(flag.id)}
                  disabled={deletingId === flag.id}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0"
                >
                  {deletingId === flag.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
