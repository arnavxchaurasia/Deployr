"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Lock, Plus, Trash2, ArrowLeft, Key } from "lucide-react";

type EnvVar = {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
};

export default function EnvVaultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [envs, setEnvs] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [bulkEnvStr, setBulkEnvStr] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchEnvs = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/env`);
      setEnvs(res.data);
    } catch {
      toast.error("Failed to fetch environment variables");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEnvs();
  }, [fetchEnvs]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    try {
      setSaving(true);
      await api.post(`/project/${id}/env`, { key: newKey.trim(), value: newValue.trim() });
      toast.success("Environment variable securely saved");
      setNewKey("");
      setNewValue("");
      fetchEnvs();
    } catch {
      toast.error("Failed to save environment variable");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkEnvStr.trim()) return;

    const lines = bulkEnvStr.split('\\n');
    const variables: { key: string, value: string }[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      
      const firstEq = line.indexOf('=');
      if (firstEq === -1) continue;

      const key = line.substring(0, firstEq).trim();
      let value = line.substring(firstEq + 1).trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }

      if (key && value) {
        variables.push({ key, value });
      }
    }

    if (variables.length === 0) {
      toast.error("No valid variables found to import");
      return;
    }

    try {
      setSaving(true);
      await api.post(`/project/${id}/env/bulk`, { variables });
      toast.success(`Imported ${variables.length} environment variables`);
      setBulkEnvStr("");
      fetchEnvs();
    } catch {
      toast.error("Failed to bulk import variables");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(key: string) {
    try {
      await api.delete(`/project/${id}/env/${key}`);
      toast.success("Variable deleted");
      fetchEnvs();
    } catch {
      toast.error("Failed to delete variable");
    }
  }

  if (loading) return <div className="p-10">Loading Environment Vault...</div>;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <Lock className="text-primary" size={28} />
            Environment Variables Vault
          </h1>
          <p className="text-zinc-500 mt-2">
            Securely store secrets like API keys and database passwords. These are encrypted using AES-256-GCM and injected into your build and runtime securely.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-50/50 dark:bg-zinc-900/50">
          <h2 className="text-lg font-medium mb-4">Add Single Variable</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Key</label>
              <Input 
                placeholder="e.g. DATABASE_URL" 
                value={newKey} 
                onChange={e => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Value (Encrypted at rest)</label>
              <Input 
                type="password"
                placeholder="Enter secret value..." 
                value={newValue} 
                onChange={e => setNewValue(e.target.value)} 
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving || !newKey || !newValue}>
              <Plus size={16} className="mr-2" />
              {saving ? "Saving..." : "Add Secret"}
            </Button>
          </form>
        </Card>

        <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-50/50 dark:bg-zinc-900/50">
          <h2 className="text-lg font-medium mb-4">Bulk Import (.env file)</h2>
          <form onSubmit={handleBulkImport} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-500">Paste the contents of your .env file below</label>
              <textarea 
                className="w-full h-32 p-3 text-sm font-mono border rounded-md bg-white dark:bg-black border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="API_KEY=secret_value\nPORT=8000\nDATABASE_URL=postgres://..."
                value={bulkEnvStr}
                onChange={e => setBulkEnvStr(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" variant="outline" disabled={saving || !bulkEnvStr.trim()}>
              <Lock size={16} className="mr-2" />
              {saving ? "Importing..." : "Secure Bulk Import"}
            </Button>
          </form>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-medium">Current Secrets</h2>
        {envs.length === 0 ? (
          <div className="p-10 border border-dashed rounded-lg text-center text-zinc-500">
            <Key size={32} className="mx-auto mb-4 opacity-50" />
            No environment variables configured yet.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {envs.map(env => (
                  <tr key={env.id} className="bg-white dark:bg-black group">
                    <td className="px-4 py-4 font-mono text-xs">{env.key}</td>
                    <td className="px-4 py-4 font-mono text-xs text-zinc-500">{env.value}</td>
                    <td className="px-4 py-4 text-zinc-500">{new Date(env.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-4 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDelete(env.key)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
