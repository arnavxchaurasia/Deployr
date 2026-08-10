"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Key, Plus, Trash2, Loader2, Copy, CheckCircle2,
  AlertTriangle, ChevronDown,
} from "lucide-react";

type Scope = "read" | "deploy" | "full";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] = useState<Scope>("read");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await api.get("/api-keys");
      setKeys(res.data?.keys ?? res.data ?? []);
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleCreate() {
    if (!newKeyName.trim()) { toast.error("Enter a name for the key"); return; }
    setCreating(true);
    try {
      const res = await api.post("/api-keys", { name: newKeyName.trim(), scopes: [newKeyScope] });
      setGeneratedKey(res.data?.key ?? res.data?.apiKey ?? null);
      setNewKeyName("");
      setNewKeyScope("read");
      setShowForm(false);
      await fetchKeys();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this API key? Any application using it will immediately lose access.")) return;
    setRevoking(id);
    try {
      await api.delete(`/api-keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success("API key revoked");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to revoke key");
    } finally {
      setRevoking(null);
    }
  }

  async function copyKey() {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const scopeBadge = (scope: string) => {
    const map: Record<string, string> = {
      read: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      deploy: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      full: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    };
    return map[scope] ?? "bg-zinc-500/10 text-zinc-500 border-zinc-300 dark:border-zinc-700";
  };

  return (
    <div className="max-w-3xl space-y-8 pb-20 animate-fadeIn">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
            API Keys
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
            Manage personal API keys to authenticate with the Deployr API.
          </p>
        </div>
        <Button
          onClick={() => { setShowForm((v) => !v); setGeneratedKey(null); }}
          className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-500/10 shrink-0"
        >
          <Plus size={15} className="mr-1.5" />
          New Key
        </Button>
      </div>

      {/* New key generated — show once */}
      {generatedKey && (
        <Card className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Key created — copy it now</p>
              <p className="text-xs text-zinc-500 mt-0.5">This key will not be shown again.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3">
            <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300 flex-1 break-all select-all">
              {generatedKey}
            </p>
            <Button size="sm" variant="ghost" onClick={copyKey} className="shrink-0 h-8 px-3 rounded-lg">
              {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setGeneratedKey(null)}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            Dismiss
          </Button>
        </Card>
      )}

      {/* Create form */}
      {showForm && (
        <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-4">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Create New Key</h3>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Key Name</label>
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. CI Deploy Bot"
              className="h-11 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Scope</label>
            <div className="relative">
              <select
                value={newKeyScope}
                onChange={(e) => setNewKeyScope(e.target.value as Scope)}
                className="w-full h-11 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-900/30 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
              >
                <option value="read">read — list projects, view deployments</option>
                <option value="deploy">deploy — trigger deployments</option>
                <option value="full">full — full API access</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-11 rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim()}
              className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : "Create Key"}
            </Button>
          </div>
        </Card>
      )}

      {/* Keys list */}
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={22} className="animate-spin text-zinc-400" />
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3 text-zinc-400">
            <Key size={32} className="opacity-30" />
            <p className="text-sm">No API keys yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-white/5">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <Key size={15} className="text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{k.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5 font-mono">{k.prefix}••••••••</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {(k.scopes ?? []).map((s) => (
                    <span key={s} className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${scopeBadge(s)}`}>
                      {s}
                    </span>
                  ))}
                  <span className="text-[10px] text-zinc-400">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRevoke(k.id)}
                    disabled={revoking === k.id}
                    className="h-8 w-8 p-0 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    {revoking === k.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-700 dark:text-amber-400">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          API keys are shown only once at creation. Store them in a secrets manager.
          Revoking a key immediately cuts off any application using it.
        </p>
      </div>
    </div>
  );
}
