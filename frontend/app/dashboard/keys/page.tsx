"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, Plus, Trash2, Copy, CheckCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await api.get("/api-keys");
      setKeys(res.data);
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post("/api-keys", { name: newKeyName.trim() });
      setNewlyCreatedKey(res.data.key);
      setNewKeyName("");
      fetchKeys();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? Any integrations using this key will stop working.`)) return;
    try {
      await api.delete(`/api-keys/${id}`);
      setKeys(prev => prev.filter(k => k.id !== id));
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  function copyKey() {
    if (!newlyCreatedKey) return;
    navigator.clipboard.writeText(newlyCreatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <Key size={28} className="text-indigo-500" /> API Keys
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Use API keys to authenticate programmatic access to Deployr. Keys are shown once — store them securely.
        </p>
      </div>

      {/* New key reveal banner */}
      {newlyCreatedKey && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
            <CheckCheck size={16} /> Key created — copy it now, it won't be shown again
          </div>
          <div className="flex items-center gap-3">
            <code className="flex-1 font-mono text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 overflow-x-auto whitespace-nowrap">
              {newlyCreatedKey}
            </code>
            <Button size="sm" variant="outline" onClick={copyKey} className="shrink-0 rounded-xl gap-2">
              {copied ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <button
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline"
            onClick={() => setNewlyCreatedKey(null)}
          >
            I&apos;ve saved it, dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      <Card className="p-6 border-zinc-200 dark:border-zinc-800 rounded-2xl">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Create new key</p>
        <form onSubmit={handleCreate} className="flex gap-3">
          <Input
            placeholder="Key name (e.g. CI/CD pipeline)"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            maxLength={64}
            className="flex-1 rounded-xl"
          />
          <Button
            type="submit"
            disabled={creating || !newKeyName.trim()}
            className="rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <Plus size={16} /> Create
          </Button>
        </form>
        <p className="text-xs text-zinc-400 mt-2">Maximum 10 keys per account.</p>
      </Card>

      {/* Keys list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">
          No API keys yet. Create one above.
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <div
              key={key.id}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-white/10"
            >
              <Key size={16} className="text-zinc-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{key.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                  {key.prefix}{"•".repeat(38)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-zinc-400">Created {formatRelative(key.createdAt)}</p>
                {key.lastUsedAt && (
                  <p className="text-xs text-zinc-300 dark:text-zinc-500">
                    Last used {formatRelative(key.lastUsedAt)}
                  </p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(key.id, key.name)}
                className="shrink-0 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl"
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Card className="p-5 border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 rounded-2xl">
        <div className="flex gap-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
            <p className="font-semibold">Keep your keys private</p>
            <p>Anyone with a key can trigger deployments and access your project data. Revoke compromised keys immediately.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}