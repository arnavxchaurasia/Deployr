"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Lock, Plus, Trash2, ArrowLeft, Key, Settings2,
  Webhook, Copy, RefreshCw, X, Save, Terminal,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type EnvVar = { id: string; key: string; value: string; updatedAt: string };

type BuildConfig = {
  buildCommand: string;
  outputDir: string;
  installCommand: string;
  rootDir: string;
};

// ── Tab navigation ────────────────────────────────────────────────────────────

const TABS = [
  { id: "variables",    label: "Variables",    icon: Lock },
  { id: "build",        label: "Build",        icon: Terminal },
  { id: "integrations", label: "Integrations", icon: Webhook },
] as const;

type Tab = (typeof TABS)[number]["id"];

// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get("tab") as Tab) || "variables");

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="text-primary" size={24} />
            Project Settings
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Configure build, environment variables, and integrations.</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-white/10">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "variables"    && <EnvVarsTab    projectId={id} />}
      {tab === "build"        && <BuildConfigTab projectId={id} />}
      {tab === "integrations" && <IntegrationsTab projectId={id} />}
    </div>
  );
}

// ── Environment Variables tab ─────────────────────────────────────────────────

function EnvVarsTab({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [bulkEnvStr, setBulkEnvStr] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchEnvs = useCallback(async () => {
    try {
      const res = await api.get(`/project/${projectId}/env`);
      setEnvs(res.data);
    } catch {
      toast.error("Failed to fetch environment variables");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchEnvs(); }, [fetchEnvs]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    try {
      setSaving(true);
      await api.post(`/project/${projectId}/env`, { key: newKey.trim(), value: newValue.trim() });
      toast.success("Environment variable saved");
      setNewKey(""); setNewValue("");
      fetchEnvs();
    } catch { toast.error("Failed to save environment variable"); }
    finally { setSaving(false); }
  }

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkEnvStr.trim()) return;
    const variables: { key: string; value: string }[] = [];
    for (let line of bulkEnvStr.split("\n")) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.substring(0, eq).trim();
      let value = line.substring(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1);
      if (key && value) variables.push({ key, value });
    }
    if (!variables.length) { toast.error("No valid variables found"); return; }
    try {
      setSaving(true);
      await api.post(`/project/${projectId}/env/bulk`, { variables });
      toast.success(`Imported ${variables.length} variables`);
      setBulkEnvStr(""); fetchEnvs();
    } catch { toast.error("Failed to import variables"); }
    finally { setSaving(false); }
  }

  async function handleDelete(key: string) {
    try {
      await api.delete(`/project/${projectId}/env/${key}`);
      toast.success("Variable deleted");
      fetchEnvs();
    } catch { toast.error("Failed to delete variable"); }
  }

  if (loading) return <div className="p-10 text-zinc-500">Loading variables…</div>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50">
          <h2 className="text-base font-semibold mb-4">Add Variable</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <Input
              placeholder="KEY"
              value={newKey}
              onChange={e => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
            />
            <Input type="password" placeholder="value" value={newValue} onChange={e => setNewValue(e.target.value)} />
            <Button type="submit" className="w-full" disabled={saving || !newKey || !newValue}>
              <Plus size={15} className="mr-2" />
              {saving ? "Saving…" : "Add Secret"}
            </Button>
          </form>
        </Card>

        <Card className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50">
          <h2 className="text-base font-semibold mb-4">Bulk Import (.env)</h2>
          <form onSubmit={handleBulkImport} className="space-y-4">
            <textarea
              className="w-full h-32 p-3 text-sm font-mono border rounded-md bg-white dark:bg-black border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder={"API_KEY=secret\nDATABASE_URL=postgres://..."}
              value={bulkEnvStr}
              onChange={e => setBulkEnvStr(e.target.value)}
            />
            <Button type="submit" className="w-full" variant="outline" disabled={saving || !bulkEnvStr.trim()}>
              <Lock size={15} className="mr-2" />
              {saving ? "Importing…" : "Secure Bulk Import"}
            </Button>
          </form>
        </Card>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-4">Current Secrets</h2>
        {envs.length === 0 ? (
          <div className="p-10 border border-dashed rounded-lg text-center text-zinc-500">
            <Key size={32} className="mx-auto mb-4 opacity-40" />
            No environment variables yet.
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
                    <td className="px-4 py-4 text-zinc-500 text-xs">{new Date(env.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-4 text-right">
                      <Button variant="ghost" size="icon"
                        className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDelete(env.key)}>
                        <Trash2 size={15} />
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

// ── Build Config tab ──────────────────────────────────────────────────────────

function BuildConfigTab({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState<BuildConfig>({
    buildCommand: "npm run build",
    outputDir: "dist",
    installCommand: "npm install",
    rootDir: ".",
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get(`/project/${projectId}`).then(res => {
      const d = res.data.data;
      setConfig({
        buildCommand:   d.buildCommand   || "npm run build",
        outputDir:      d.outputDir      || "dist",
        installCommand: d.installCommand || "npm install",
        rootDir:        d.rootDir        || ".",
      });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [projectId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/project/${projectId}`, config);
      toast.success("Build configuration saved");
    } catch {
      toast.error("Failed to save build configuration");
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, key: keyof BuildConfig, placeholder: string) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      <Input
        value={config[key]}
        onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
        placeholder={placeholder}
        className="font-mono text-sm"
      />
    </div>
  );

  if (!loaded) return <div className="p-10 text-zinc-500">Loading…</div>;

  return (
    <form onSubmit={save} className="space-y-6 max-w-xl">
      <Card className="p-6 space-y-5 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold">Build Settings</h2>
          <p className="text-xs text-zinc-500 mt-1">These values are passed to your ECS builder container as environment variables.</p>
        </div>
        {field("Install Command", "installCommand", "npm install")}
        {field("Build Command", "buildCommand", "npm run build")}
        {field("Output Directory", "outputDir", "dist")}
        {field("Root Directory", "rootDir", ".")}
      </Card>

      <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
        <Save size={15} className="mr-2" />
        {saving ? "Saving…" : "Save Build Settings"}
      </Button>
    </form>
  );
}

// ── Integrations tab ──────────────────────────────────────────────────────────

function IntegrationsTab({ projectId }: { projectId: string }) {
  const [hookUrl, setHookUrl] = useState<string | null>(null);
  const [generatingHook, setGeneratingHook] = useState(false);
  const [revokingHook, setRevokingHook] = useState(false);

  const [notifyUrl, setNotifyUrl] = useState("");
  const [savingNotify, setSavingNotify] = useState(false);
  const [notifyLoaded, setNotifyLoaded] = useState(false);

  useEffect(() => {
    api.get(`/project/${projectId}`).then(res => {
      const d = res.data.data;
      setNotifyUrl(d.notifyWebhookUrl || "");
      setNotifyLoaded(true);
    }).catch(() => setNotifyLoaded(true));
  }, [projectId]);

  async function generateHook() {
    setGeneratingHook(true);
    try {
      const res = await api.post(`/project/${projectId}/deploy-hook`);
      setHookUrl(res.data.hookUrl);
      toast.success("Deploy hook created");
    } catch {
      toast.error("Failed to create deploy hook");
    } finally {
      setGeneratingHook(false);
    }
  }

  async function revokeHook() {
    if (!confirm("Revoke this deploy hook? Any CI/CD pipelines using it will stop working.")) return;
    setRevokingHook(true);
    try {
      await api.delete(`/project/${projectId}/deploy-hook`);
      setHookUrl(null);
      toast.success("Deploy hook revoked");
    } catch {
      toast.error("Failed to revoke deploy hook");
    } finally {
      setRevokingHook(false);
    }
  }

  async function saveNotify(e: React.FormEvent) {
    e.preventDefault();
    setSavingNotify(true);
    try {
      await api.patch(`/project/${projectId}`, { notifyWebhookUrl: notifyUrl || null });
      toast.success("Notification webhook saved");
    } catch {
      toast.error("Failed to save notification webhook");
    } finally {
      setSavingNotify(false);
    }
  }

  function copyHook() {
    if (!hookUrl) return;
    navigator.clipboard.writeText(hookUrl);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="space-y-8 max-w-xl">

      {/* Deploy hooks */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <RefreshCw size={16} className="text-indigo-500" />
            Deploy Hook
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            POST to this URL from any CI/CD pipeline or cron job to trigger a deploy — no authentication required.
          </p>
        </div>

        {hookUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg overflow-x-auto block">
                {hookUrl}
              </code>
              <Button variant="outline" size="icon" onClick={copyHook}>
                <Copy size={14} />
              </Button>
            </div>
            <Button variant="ghost" size="sm"
              onClick={revokeHook} disabled={revokingHook}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 text-xs">
              <X size={13} className="mr-1.5" />
              {revokingHook ? "Revoking…" : "Revoke hook"}
            </Button>
          </div>
        ) : (
          <Button onClick={generateHook} disabled={generatingHook} variant="outline">
            <RefreshCw size={14} className="mr-2" />
            {generatingHook ? "Generating…" : "Generate Deploy Hook URL"}
          </Button>
        )}
      </Card>

      {/* Notification webhook */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Webhook size={16} className="text-indigo-500" />
            Notification Webhook
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Deployr will POST a JSON payload to this URL on every successful or failed deployment.
            Works with Slack incoming webhooks, Discord webhooks, or any custom endpoint.
          </p>
        </div>

        {notifyLoaded && (
          <form onSubmit={saveNotify} className="space-y-3">
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={notifyUrl}
              onChange={e => setNotifyUrl(e.target.value)}
              className="font-mono text-sm"
            />
            <div className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 font-mono leading-relaxed">
              {`{ "event": "deployment.succeeded", "projectName": "my-app",\n  "deploymentId": "...", "branch": "main", "timestamp": "..." }`}
            </div>
            <Button type="submit" disabled={savingNotify} variant="outline">
              <Save size={14} className="mr-2" />
              {savingNotify ? "Saving…" : "Save Webhook URL"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}