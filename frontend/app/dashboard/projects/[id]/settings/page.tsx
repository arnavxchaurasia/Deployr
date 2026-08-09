"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Lock, Plus, Trash2, ArrowLeft, Key, Settings2,
  Webhook, Copy, RefreshCw, X, Save, Terminal, ShieldCheck, CalendarClock,
  Download, Upload, Route, Globe2, Gauge, Image as ImageIcon,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type EnvVar = { id: string; key: string; value: string; updatedAt: string };

type BuildConfig = {
  buildCommand: string;
  outputDir: string;
  installCommand: string;
  rootDir: string;
};

type BlackoutWindow = { day: number; startMinute: number; endMinute: number };

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minutesToTime(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

type StorageAddon = {
  id: string;
  type: "postgres" | "redis" | "kv" | "blob";
  name: string;
  envVarKey: string;
  status: string;
  hasConnectionString: boolean;
};

type RedirectRule = { source: string; destination: string; type: "redirect" | "rewrite"; statusCode?: number };
type HeaderRule = { source: string; headers: Record<string, string> };
type GeoRules = { mode: "allow" | "block"; countries: string[] } | null;

// ── Tab navigation ────────────────────────────────────────────────────────────

const TABS = [
  { id: "variables",    label: "Variables",    icon: Lock },
  { id: "build",        label: "Build",        icon: Terminal },
  { id: "edge",         label: "Edge Rules",   icon: Route },
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
      {tab === "edge"         && <EdgeRulesTab   projectId={id} />}
      {tab === "integrations" && <IntegrationsTab projectId={id} />}
    </div>
  );
}

// ── Environment Variables tab ─────────────────────────────────────────────────

type EnvGroupSummary = { id: string; name: string };

function EnvVarsTab({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [bulkEnvStr, setBulkEnvStr] = useState("");
  const [saving, setSaving] = useState(false);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgGroups, setOrgGroups] = useState<EnvGroupSummary[]>([]);
  const [attachedGroups, setAttachedGroups] = useState<EnvGroupSummary[]>([]);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);

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

  useEffect(() => {
    api.get(`/project/${projectId}`).then(async (res) => {
      const projOrgId = res.data.data.orgId;
      setOrgId(projOrgId);
      if (!projOrgId) return;
      try {
        const [groupsRes, attachedRes] = await Promise.all([
          api.get(`/orgs/${projOrgId}/env-groups`),
          api.get(`/project/${projectId}/env-groups`),
        ]);
        setOrgGroups(groupsRes.data.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
        setAttachedGroups(attachedRes.data);
      } catch {
        // Shared env groups are optional — silently skip if unavailable
      }
    }).catch(() => {});
  }, [projectId]);

  async function toggleGroup(group: EnvGroupSummary, attach: boolean) {
    setSavingGroupId(group.id);
    try {
      if (attach) {
        await api.post(`/project/${projectId}/env-groups/${group.id}`);
        setAttachedGroups((g) => [...g, group]);
      } else {
        await api.delete(`/project/${projectId}/env-groups/${group.id}`);
        setAttachedGroups((g) => g.filter((x) => x.id !== group.id));
      }
    } catch {
      toast.error(`Failed to ${attach ? "attach" : "detach"} group`);
    } finally {
      setSavingGroupId(null);
    }
  }

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
      {orgId && orgGroups.length > 0 && (
        <Card className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50">
          <h2 className="text-base font-semibold mb-1">Shared Env Groups</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Attach a team-wide shared variable set. Manage groups and their variables in{" "}
            <a href="/dashboard/settings/team" className="text-indigo-500 hover:underline">Team Settings</a>.
          </p>
          <div className="flex flex-wrap gap-2">
            {orgGroups.map((g) => {
              const attached = attachedGroups.some((a) => a.id === g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  disabled={savingGroupId === g.id}
                  onClick={() => toggleGroup(g, !attached)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    attached
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-indigo-400"
                  }`}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </Card>
      )}

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

  const [region, setRegion] = useState("us-east-1");
  const [regions, setRegions] = useState<string[]>(["us-east-1"]);
  const [savingRegion, setSavingRegion] = useState(false);

  const [failoverRegion, setFailoverRegion] = useState("");
  const [savingFailover, setSavingFailover] = useState(false);

  const [stagingBranch, setStagingBranch] = useState("");
  const [savingStagingBranch, setSavingStagingBranch] = useState(false);

  const [smokeTestPath, setSmokeTestPath] = useState("");
  const [savingSmokeTest, setSavingSmokeTest] = useState(false);

  const [useDockerfile, setUseDockerfile] = useState(false);
  const [savingDockerfile, setSavingDockerfile] = useState(false);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const [blackoutWindows, setBlackoutWindows] = useState<BlackoutWindow[]>([]);
  const [savingBlackout, setSavingBlackout] = useState(false);

  const [requireApproval, setRequireApproval] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);

  useEffect(() => {
    api.get(`/project/${projectId}`).then(res => {
      const d = res.data.data;
      setConfig({
        buildCommand:   d.buildCommand   || "npm run build",
        outputDir:      d.outputDir      || "dist",
        installCommand: d.installCommand || "npm install",
        rootDir:        d.rootDir        || ".",
      });
      setRegion(d.region || "us-east-1");
      setFailoverRegion(d.failoverRegion || "");
      setStagingBranch(d.stagingBranch || "");
      setSmokeTestPath(d.smokeTestPath || "");
      setUseDockerfile(Boolean(d.useDockerfile));
      setMaintenanceMode(Boolean(d.maintenanceMode));
      setMaintenanceMessage(d.maintenanceMessage || "");
      setRequireApproval(Boolean(d.requireApproval));
      setBlackoutWindows(Array.isArray(d.blackoutWindows) ? d.blackoutWindows : []);
      setLoaded(true);
    }).catch(() => setLoaded(true));

    api.get("/regions").then(res => setRegions(res.data.regions ?? ["us-east-1"])).catch(() => {});
  }, [projectId]);

  async function toggleRequireApproval() {
    const next = !requireApproval;
    setSavingApproval(true);
    try {
      await api.patch(`/project/${projectId}`, { requireApproval: next });
      setRequireApproval(next);
      toast.success(next ? "Manual approval now required before deploys go live" : "Manual approval disabled — builds auto-promote again");
    } catch {
      toast.error("Failed to update approval setting");
    } finally {
      setSavingApproval(false);
    }
  }

  async function toggleMaintenance() {
    const next = !maintenanceMode;
    setSavingMaintenance(true);
    try {
      await api.patch(`/project/${projectId}`, { maintenanceMode: next, maintenanceMessage: maintenanceMessage.trim() || null });
      setMaintenanceMode(next);
      toast.success(next ? "Maintenance mode enabled — visitors now see the maintenance page" : "Maintenance mode disabled");
    } catch {
      toast.error("Failed to update maintenance mode");
    } finally {
      setSavingMaintenance(false);
    }
  }

  async function toggleDockerfile() {
    const next = !useDockerfile;
    setSavingDockerfile(true);
    try {
      await api.patch(`/project/${projectId}`, { useDockerfile: next });
      setUseDockerfile(next);
      toast.success(next ? "Docker builds enabled" : "Docker builds disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update Docker build setting");
    } finally {
      setSavingDockerfile(false);
    }
  }

  async function saveSmokeTest() {
    setSavingSmokeTest(true);
    try {
      await api.patch(`/project/${projectId}`, { smokeTestPath: smokeTestPath.trim() || null });
      toast.success(smokeTestPath.trim() ? "Smoke test enabled" : "Smoke test disabled");
    } catch {
      toast.error("Failed to save smoke test path");
    } finally {
      setSavingSmokeTest(false);
    }
  }

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

  async function saveBlackoutWindows(next: BlackoutWindow[]) {
    setSavingBlackout(true);
    try {
      await api.patch(`/project/${projectId}`, { blackoutWindows: next.length ? next : null });
      setBlackoutWindows(next);
      toast.success("Blackout windows saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save blackout windows");
    } finally {
      setSavingBlackout(false);
    }
  }

  function addBlackoutWindow() {
    setBlackoutWindows(w => [...w, { day: 5, startMinute: 22 * 60, endMinute: 2 * 60 }]);
  }

  function updateBlackoutWindow(i: number, patch: Partial<BlackoutWindow>) {
    setBlackoutWindows(w => w.map((win, idx) => (idx === i ? { ...win, ...patch } : win)));
  }

  function removeBlackoutWindow(i: number) {
    const next = blackoutWindows.filter((_, idx) => idx !== i);
    saveBlackoutWindows(next);
  }

  async function saveRegion(nextRegion: string) {
    setRegion(nextRegion);
    setSavingRegion(true);
    try {
      await api.patch(`/project/${projectId}`, { region: nextRegion });
      toast.success(`Future builds will run in ${nextRegion}`);
    } catch {
      toast.error("Failed to update region");
    } finally {
      setSavingRegion(false);
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

      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold">Build Region</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Which AWS region builds run in and Lambda functions are created in. Applies to future
            deployments only — existing deployments keep the region they were built in.
          </p>
        </div>
        <select
          value={region}
          onChange={e => saveRegion(e.target.value)}
          disabled={savingRegion}
          className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-transparent"
        >
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </Card>

      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold">Cross-Region Failover</h2>
          <p className="text-xs text-zinc-500 mt-1">
            If this project's uptime checks fail for ~5 consecutive minutes, Deployr automatically
            triggers a build in the fallback region below and promotes it — no manual redeploy
            needed. Leave unset to disable. This project's region becomes the fallback region once
            a failover happens.
          </p>
        </div>
        <select
          value={failoverRegion}
          onChange={async e => {
            const next = e.target.value;
            setFailoverRegion(next);
            setSavingFailover(true);
            try {
              await api.patch(`/project/${projectId}`, { failoverRegion: next || null });
              toast.success(next ? `Failover fallback set to ${next}` : "Failover disabled");
            } catch {
              toast.error("Failed to update failover region");
            } finally {
              setSavingFailover(false);
            }
          }}
          disabled={savingFailover}
          className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-transparent"
        >
          <option value="">Disabled</option>
          {regions.filter(r => r !== region).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </Card>

      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold">Staging Environment</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Pushes to this branch build a persistent staging deployment at{" "}
            <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"<project>"}-staging</code> —
            unlike a PR preview it's never torn down, and unlike production it's never
            auto-promoted. Leave blank to disable.
          </p>
        </div>
        <div className="flex gap-3">
          <Input
            value={stagingBranch}
            onChange={e => setStagingBranch(e.target.value)}
            placeholder="e.g. staging (disabled)"
            className="font-mono text-sm"
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={savingStagingBranch}
            onClick={async () => {
              setSavingStagingBranch(true);
              try {
                await api.patch(`/project/${projectId}`, { stagingBranch: stagingBranch.trim() || null });
                toast.success(stagingBranch.trim() ? `Staging branch set to ${stagingBranch.trim()}` : "Staging disabled");
              } catch {
                toast.error("Failed to update staging branch");
              } finally {
                setSavingStagingBranch(false);
              }
            }}
          >
            {savingStagingBranch ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold">Post-Deploy Smoke Test</h2>
          <p className="text-xs text-zinc-500 mt-1">
            After a build finishes, fetch this path before marking the deployment READY. A
            non-2xx response or timeout fails the deployment instead of going live. Leave blank
            to disable.
          </p>
        </div>
        <div className="flex gap-3">
          <Input
            value={smokeTestPath}
            onChange={e => setSmokeTestPath(e.target.value)}
            placeholder="/ (disabled)"
            className="font-mono text-sm"
          />
          <Button type="button" onClick={saveSmokeTest} disabled={savingSmokeTest} variant="outline" className="shrink-0">
            {savingSmokeTest ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Custom Docker Build</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Build from a Dockerfile at your repo root instead of the fixed install/build
              pipeline above. Requires the operator to have configured a CodeBuild project
              (Fargate can't run Docker-in-Docker) — ask your platform admin if this fails.
            </p>
          </div>
          <Button type="button" onClick={toggleDockerfile} disabled={savingDockerfile} variant={useDockerfile ? "default" : "outline"} className="shrink-0">
            {savingDockerfile ? "Saving…" : useDockerfile ? "Enabled" : "Disabled"}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Require Manual Approval</h2>
            <p className="text-xs text-zinc-500 mt-1">
              A production build that finishes successfully waits for an admin to approve it before it
              goes live, instead of auto-promoting. Preview deployments are never gated. Approve or
              reject from the Deployments list.
            </p>
          </div>
          <Button type="button" onClick={toggleRequireApproval} disabled={savingApproval} variant={requireApproval ? "default" : "outline"} className="shrink-0">
            {savingApproval ? "Saving…" : requireApproval ? "Enabled" : "Disabled"}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold">Maintenance Mode</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Serve a static "down for maintenance" page on your production domain instead of the live
            deployment. Doesn't unpublish or touch your active deployment — turning this off instantly
            restores normal serving. Direct preview/deployment links stay reachable so your team can
            still QA.
          </p>
        </div>
        <textarea
          value={maintenanceMessage}
          onChange={e => setMaintenanceMessage(e.target.value)}
          placeholder="This site is temporarily down for maintenance."
          rows={2}
          className="w-full text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
        />
        <Button type="button" onClick={toggleMaintenance} disabled={savingMaintenance} variant={maintenanceMode ? "destructive" : "outline"}>
          {savingMaintenance ? "Saving…" : maintenanceMode ? "Disable Maintenance Mode" : "Enable Maintenance Mode"}
        </Button>
      </Card>

      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <CalendarClock size={16} className="text-indigo-500" />
            Deployment Blackout Windows
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Recurring weekly UTC time ranges during which deploys (manual or webhook-triggered)
            are rejected outright, not queued. Different from cron jobs — a cron job makes a deploy
            happen on a schedule, this blocks deploys from happening during a window.
          </p>
        </div>

        {blackoutWindows.length > 0 && (
          <div className="space-y-2">
            {blackoutWindows.map((w, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <select
                  value={w.day}
                  onChange={e => updateBlackoutWindow(i, { day: Number(e.target.value) })}
                  className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-transparent"
                >
                  {DAY_LABELS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                </select>
                <input
                  type="time"
                  value={minutesToTime(w.startMinute)}
                  onChange={e => updateBlackoutWindow(i, { startMinute: timeToMinutes(e.target.value) })}
                  className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-transparent"
                />
                <span className="text-xs text-zinc-400">to</span>
                <input
                  type="time"
                  value={minutesToTime(w.endMinute)}
                  onChange={e => updateBlackoutWindow(i, { endMinute: timeToMinutes(e.target.value) })}
                  className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-transparent"
                />
                <span className="text-xs text-zinc-400">UTC</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBlackoutWindow(i)}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addBlackoutWindow}>
            <Plus size={13} className="mr-1.5" />
            Add window
          </Button>
          {blackoutWindows.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => saveBlackoutWindows(blackoutWindows)}
              disabled={savingBlackout}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Save size={13} className="mr-1.5" />
              {savingBlackout ? "Saving…" : "Save windows"}
            </Button>
          )}
        </div>
      </Card>
    </form>
  );
}

// ── Edge Rules tab ─────────────────────────────────────────────────────────────

function EdgeRulesTab({ projectId }: { projectId: string }) {
  const [loaded, setLoaded] = useState(false);

  const [redirectRules, setRedirectRules] = useState<RedirectRule[]>([]);
  const [savingRedirects, setSavingRedirects] = useState(false);

  const [headerRules, setHeaderRules] = useState<HeaderRule[]>([]);
  const [savingHeaders, setSavingHeaders] = useState(false);

  const [geoMode, setGeoMode] = useState<"allow" | "block">("block");
  const [geoCountries, setGeoCountries] = useState("");
  const [geoEnabled, setGeoEnabled] = useState(false);
  const [savingGeo, setSavingGeo] = useState(false);

  const [rateLimit, setRateLimit] = useState("");
  const [savingRateLimit, setSavingRateLimit] = useState(false);

  const [botProtectionEnabled, setBotProtectionEnabled] = useState(false);
  const [blockEmptyUserAgent, setBlockEmptyUserAgent] = useState(false);
  const [blockedUserAgents, setBlockedUserAgents] = useState("");
  const [maxBotScore, setMaxBotScore] = useState("");
  const [savingBotProtection, setSavingBotProtection] = useState(false);

  const [compressionDisabled, setCompressionDisabled] = useState(false);
  const [savingCompression, setSavingCompression] = useState(false);

  useEffect(() => {
    api.get(`/project/${projectId}`).then(res => {
      const d = res.data.data;
      setRedirectRules(Array.isArray(d.redirectRules) ? d.redirectRules : []);
      setHeaderRules(Array.isArray(d.headerRules) ? d.headerRules : []);
      const geo: GeoRules = d.geoRules ?? null;
      setGeoEnabled(!!geo);
      setGeoMode(geo?.mode ?? "block");
      setGeoCountries((geo?.countries ?? []).join(", "));
      setRateLimit(d.rateLimitPerMinute != null ? String(d.rateLimitPerMinute) : "");
      const bot = d.botProtection ?? null;
      setBotProtectionEnabled(bot?.mode === "block");
      setBlockEmptyUserAgent(Boolean(bot?.blockEmptyUserAgent));
      setBlockedUserAgents((bot?.blockedUserAgents ?? []).join(", "));
      setMaxBotScore(bot?.maxBotScore != null ? String(bot.maxBotScore) : "");
      setCompressionDisabled(d.compressionMode === "disabled");
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [projectId]);

  async function saveBotProtection() {
    setSavingBotProtection(true);
    try {
      const botProtection = botProtectionEnabled
        ? {
            mode: "block" as const,
            blockEmptyUserAgent,
            blockedUserAgents: blockedUserAgents.split(",").map(s => s.trim()).filter(Boolean),
            ...(maxBotScore.trim() ? { maxBotScore: parseInt(maxBotScore.trim(), 10) } : {}),
          }
        : null;
      await api.patch(`/project/${projectId}`, { botProtection });
      toast.success(botProtection ? "Bot protection enabled" : "Bot protection disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save bot protection");
    } finally {
      setSavingBotProtection(false);
    }
  }

  async function toggleCompression() {
    const next = !compressionDisabled;
    setSavingCompression(true);
    try {
      await api.patch(`/project/${projectId}`, { compressionMode: next ? "disabled" : "auto" });
      setCompressionDisabled(next);
      toast.success(next ? "Compression disabled" : "Compression re-enabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update compression setting");
    } finally {
      setSavingCompression(false);
    }
  }

  async function saveRedirectRules(next: RedirectRule[]) {
    setSavingRedirects(true);
    try {
      await api.patch(`/project/${projectId}`, { redirectRules: next.length ? next : null });
      setRedirectRules(next);
      toast.success("Redirect/rewrite rules saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save rules");
    } finally {
      setSavingRedirects(false);
    }
  }

  function addRedirectRule() {
    setRedirectRules(r => [...r, { source: "/old-path", destination: "/new-path", type: "redirect", statusCode: 308 }]);
  }
  function updateRedirectRule(i: number, patch: Partial<RedirectRule>) {
    setRedirectRules(r => r.map((rule, idx) => (idx === i ? { ...rule, ...patch } : rule)));
  }
  function removeRedirectRule(i: number) {
    saveRedirectRules(redirectRules.filter((_, idx) => idx !== i));
  }

  async function saveHeaderRules(next: HeaderRule[]) {
    setSavingHeaders(true);
    try {
      await api.patch(`/project/${projectId}`, { headerRules: next.length ? next : null });
      setHeaderRules(next);
      toast.success("Header rules saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save header rules");
    } finally {
      setSavingHeaders(false);
    }
  }

  function addHeaderRule() {
    setHeaderRules(r => [...r, { source: "/*", headers: { "X-Frame-Options": "DENY" } }]);
  }
  function updateHeaderRuleSource(i: number, source: string) {
    setHeaderRules(r => r.map((rule, idx) => (idx === i ? { ...rule, source } : rule)));
  }
  function updateHeaderRuleHeaderText(i: number, text: string) {
    const headers: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (name && value) headers[name] = value;
    }
    setHeaderRules(r => r.map((rule, ri) => (ri === i ? { ...rule, headers } : rule)));
  }
  function headerRuleToText(rule: HeaderRule) {
    return Object.entries(rule.headers).map(([k, v]) => `${k}: ${v}`).join("\n");
  }
  function removeHeaderRule(i: number) {
    saveHeaderRules(headerRules.filter((_, idx) => idx !== i));
  }

  async function saveGeoRules() {
    setSavingGeo(true);
    try {
      const countries = geoCountries.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
      const geoRules = geoEnabled && countries.length ? { mode: geoMode, countries } : null;
      await api.patch(`/project/${projectId}`, { geoRules });
      toast.success(geoRules ? "Geo rules saved" : "Geo rules disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save geo rules");
    } finally {
      setSavingGeo(false);
    }
  }

  async function saveRateLimit() {
    setSavingRateLimit(true);
    try {
      const value = rateLimit.trim() ? parseInt(rateLimit.trim(), 10) : null;
      await api.patch(`/project/${projectId}`, { rateLimitPerMinute: value });
      toast.success(value ? "Rate limit saved" : "Rate limit disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save rate limit");
    } finally {
      setSavingRateLimit(false);
    }
  }

  if (!loaded) return <div className="p-10 text-zinc-500">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Redirects & rewrites */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Route size={16} className="text-indigo-500" />
            Redirects & Rewrites
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Match a path exactly, or a prefix ending in <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">/*</code> whose
            remainder is substituted for <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">$1</code> in the destination.
            A redirect sends the visitor's browser elsewhere; a rewrite serves a different path transparently.
          </p>
        </div>
        {redirectRules.length > 0 && (
          <div className="space-y-2">
            {redirectRules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <Input value={rule.source} onChange={e => updateRedirectRule(i, { source: e.target.value })} placeholder="/old/*" className="font-mono text-xs flex-1 min-w-[120px]" />
                <span className="text-xs text-zinc-400">→</span>
                <Input value={rule.destination} onChange={e => updateRedirectRule(i, { destination: e.target.value })} placeholder="/new/$1" className="font-mono text-xs flex-1 min-w-[120px]" />
                <select
                  value={rule.type}
                  onChange={e => updateRedirectRule(i, { type: e.target.value as RedirectRule["type"] })}
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-transparent"
                >
                  <option value="redirect">Redirect</option>
                  <option value="rewrite">Rewrite</option>
                </select>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRedirectRule(i)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRedirectRule}>
            <Plus size={13} className="mr-1.5" /> Add rule
          </Button>
          {redirectRules.length > 0 && (
            <Button type="button" size="sm" onClick={() => saveRedirectRules(redirectRules)} disabled={savingRedirects} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Save size={13} className="mr-1.5" /> {savingRedirects ? "Saving…" : "Save rules"}
            </Button>
          )}
        </div>
      </Card>

      {/* Custom response headers */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck size={16} className="text-indigo-500" />
            Custom Response Headers
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Add or override response headers (CSP, HSTS, CORS, etc.) for paths matching a rule. One <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">Name: value</code> pair per line.
          </p>
        </div>
        {headerRules.length > 0 && (
          <div className="space-y-3">
            {headerRules.map((rule, i) => (
              <div key={i} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={rule.source} onChange={e => updateHeaderRuleSource(i, e.target.value)} placeholder="/*" className="font-mono text-xs flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeHeaderRule(i)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0">
                    <Trash2 size={14} />
                  </Button>
                </div>
                <textarea
                  value={headerRuleToText(rule)}
                  onChange={e => updateHeaderRuleHeaderText(i, e.target.value)}
                  placeholder={"X-Frame-Options: DENY\nContent-Security-Policy: default-src 'self'"}
                  rows={3}
                  className="w-full text-xs font-mono border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addHeaderRule}>
            <Plus size={13} className="mr-1.5" /> Add rule
          </Button>
          {headerRules.length > 0 && (
            <Button type="button" size="sm" onClick={() => saveHeaderRules(headerRules)} disabled={savingHeaders} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Save size={13} className="mr-1.5" /> {savingHeaders ? "Saving…" : "Save headers"}
            </Button>
          )}
        </div>
      </Card>

      {/* Geo routing */}
      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Globe2 size={16} className="text-indigo-500" />
              Geo-Based Access
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Allow only, or block, traffic from specific countries (ISO 3166-1 alpha-2 codes).
            </p>
          </div>
          <Button type="button" onClick={() => setGeoEnabled(e => !e)} variant={geoEnabled ? "default" : "outline"} className="shrink-0">
            {geoEnabled ? "Enabled" : "Disabled"}
          </Button>
        </div>
        {geoEnabled && (
          <div className="space-y-3">
            <select
              value={geoMode}
              onChange={e => setGeoMode(e.target.value as "allow" | "block")}
              className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-transparent"
            >
              <option value="block">Block these countries</option>
              <option value="allow">Allow only these countries</option>
            </select>
            <Input value={geoCountries} onChange={e => setGeoCountries(e.target.value)} placeholder="US, CA, GB" className="font-mono text-sm" />
          </div>
        )}
        <Button type="button" onClick={saveGeoRules} disabled={savingGeo} variant="outline" size="sm">
          <Save size={13} className="mr-1.5" /> {savingGeo ? "Saving…" : "Save"}
        </Button>
      </Card>

      {/* Rate limiting */}
      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Gauge size={16} className="text-indigo-500" />
            Edge Rate Limiting
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Max requests per client IP per minute, enforced at the edge. Best-effort per Cloudflare
            colo (not a precise global cap) — enough to blunt sustained abuse from one region.
            Leave blank to disable.
          </p>
        </div>
        <div className="flex gap-3">
          <Input value={rateLimit} onChange={e => setRateLimit(e.target.value)} placeholder="e.g. 120 (disabled)" type="number" min={1} className="font-mono text-sm" />
          <Button type="button" onClick={saveRateLimit} disabled={savingRateLimit} variant="outline" className="shrink-0">
            {savingRateLimit ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>

      {/* Bot protection */}
      <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck size={16} className="text-indigo-500" />
              Bot Protection
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Heuristic filtering, not a CAPTCHA — blocks by User-Agent and (on Cloudflare plans with
              Bot Management) a bot score threshold.
            </p>
          </div>
          <Button type="button" onClick={() => setBotProtectionEnabled(e => !e)} variant={botProtectionEnabled ? "default" : "outline"} className="shrink-0">
            {botProtectionEnabled ? "Enabled" : "Disabled"}
          </Button>
        </div>
        {botProtectionEnabled && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={blockEmptyUserAgent} onChange={e => setBlockEmptyUserAgent(e.target.checked)} className="accent-indigo-500" />
              Block requests with an empty User-Agent
            </label>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Blocked User-Agent substrings (comma-separated)</label>
              <Input value={blockedUserAgents} onChange={e => setBlockedUserAgents(e.target.value)} placeholder="AhrefsBot, SemrushBot" className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">Max bot score (1-99, lower = more bot-like — Bot Management plans only)</label>
              <Input value={maxBotScore} onChange={e => setMaxBotScore(e.target.value)} placeholder="e.g. 10 (disabled)" type="number" min={1} max={99} className="font-mono text-sm" />
            </div>
          </div>
        )}
        <Button type="button" onClick={saveBotProtection} disabled={savingBotProtection} variant="outline" size="sm">
          <Save size={13} className="mr-1.5" /> {savingBotProtection ? "Saving…" : "Save"}
        </Button>
      </Card>

      {/* Compression control */}
      <Card className="p-6 space-y-2 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Gauge size={16} className="text-indigo-500" />
              Response Compression
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              By default the edge automatically gzip/Brotli-compresses eligible responses. Disable
              this only for already-compressed or streaming payloads where re-compression wastes
              CPU or breaks framing.
            </p>
          </div>
          <Button type="button" onClick={toggleCompression} disabled={savingCompression} variant={compressionDisabled ? "destructive" : "outline"} className="shrink-0">
            {savingCompression ? "Saving…" : compressionDisabled ? "Disabled" : "Auto"}
          </Button>
        </div>
      </Card>

      {/* Image resizing */}
      <Card className="p-6 space-y-2 bg-zinc-50/50 dark:bg-zinc-900/50">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <ImageIcon size={16} className="text-indigo-500" />
          On-the-Fly Image Resizing
        </h2>
        <p className="text-xs text-zinc-500">
          Any image in this deployment's static assets can be resized at the edge — no config needed here.
          Reference it from your app as:
        </p>
        <code className="block text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg overflow-x-auto">
          /_deployr/image?src=/photo.jpg&amp;w=800&amp;q=75&amp;fit=cover
        </code>
        <p className="text-xs text-zinc-500">
          Requires Cloudflare Image Resizing enabled on the zone this worker runs on — without it, the
          original image is served unresized instead of erroring.
        </p>
      </Card>
    </div>
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

  const [protectionEnabled, setProtectionEnabled] = useState(false);
  const [protectionLoaded, setProtectionLoaded] = useState(false);
  const [protectionPassword, setProtectionPassword] = useState("");
  const [savingProtection, setSavingProtection] = useState(false);

  const [previewDbUrl, setPreviewDbUrl] = useState("");
  const [savingPreviewDb, setSavingPreviewDb] = useState(false);

  const [custom404Html, setCustom404Html] = useState("");
  const [custom500Html, setCustom500Html] = useState("");
  const [savingErrorPages, setSavingErrorPages] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string; role: string }[]>([]);
  const [transferTarget, setTransferTarget] = useState("personal");
  const [transferring, setTransferring] = useState(false);

  const [addons, setAddons] = useState<StorageAddon[]>([]);
  const [newAddonType, setNewAddonType] = useState<StorageAddon["type"]>("postgres");
  const [newAddonName, setNewAddonName] = useState("");
  const [newAddonEnvKey, setNewAddonEnvKey] = useState("");
  const [newAddonConnString, setNewAddonConnString] = useState("");
  const [creatingAddon, setCreatingAddon] = useState(false);

  const fetchAddons = useCallback(async () => {
    try {
      const res = await api.get(`/project/${projectId}/storage-addons`);
      setAddons(res.data);
    } catch {
      // optional feature — fail silently
    }
  }, [projectId]);

  useEffect(() => { fetchAddons(); }, [fetchAddons]);

  async function createAddon(e: React.FormEvent) {
    e.preventDefault();
    if (!newAddonName.trim() || !newAddonEnvKey.trim() || !newAddonConnString.trim()) return;
    setCreatingAddon(true);
    try {
      await api.post(`/project/${projectId}/storage-addons`, {
        type: newAddonType,
        name: newAddonName.trim(),
        envVarKey: newAddonEnvKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, ""),
        connectionString: newAddonConnString.trim(),
      });
      toast.success("Storage add-on connected");
      setNewAddonName(""); setNewAddonEnvKey(""); setNewAddonConnString("");
      fetchAddons();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to connect storage add-on");
    } finally {
      setCreatingAddon(false);
    }
  }

  async function removeAddon(addonId: string) {
    if (!confirm("Remove this storage add-on? Its env var will no longer be injected into builds.")) return;
    try {
      await api.delete(`/project/${projectId}/storage-addons/${addonId}`);
      setAddons((prev) => prev.filter((a) => a.id !== addonId));
      toast.success("Storage add-on removed");
    } catch {
      toast.error("Failed to remove storage add-on");
    }
  }

  useEffect(() => {
    api.get(`/project/${projectId}`).then(res => {
      const d = res.data.data;
      setNotifyUrl(d.notifyWebhookUrl || "");
      setPreviewDbUrl(d.previewDbProvisionWebhookUrl || "");
      setCustom404Html(d.custom404Html || "");
      setCustom500Html(d.custom500Html || "");
      setCurrentOrgId(d.orgId || null);
      setNotifyLoaded(true);
    }).catch(() => setNotifyLoaded(true));

    api.get(`/project/${projectId}/protection`).then(res => {
      setProtectionEnabled(res.data.enabled);
      setProtectionLoaded(true);
    }).catch(() => setProtectionLoaded(true));

    api.get("/orgs").then(res => setOrgs(res.data.orgs ?? [])).catch(() => {});
  }, [projectId]);

  async function transferProject() {
    const targetOrgId = transferTarget === "personal" ? null : transferTarget;
    if (!confirm(
      targetOrgId
        ? "Transfer this project into that team? Team owners/admins will gain access."
        : "Transfer this project back to your personal account? Team members will lose access."
    )) return;

    setTransferring(true);
    try {
      await api.post(`/project/${projectId}/transfer`, { targetOrgId });
      setCurrentOrgId(targetOrgId);
      toast.success("Project transferred");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to transfer project");
    } finally {
      setTransferring(false);
    }
  }

  async function enableProtection(e: React.FormEvent) {
    e.preventDefault();
    setSavingProtection(true);
    try {
      await api.post(`/project/${projectId}/protection`, { password: protectionPassword });
      setProtectionEnabled(true);
      setProtectionPassword("");
      toast.success("Preview protection enabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to enable preview protection");
    } finally {
      setSavingProtection(false);
    }
  }

  async function disableProtection() {
    if (!confirm("Disable preview protection? Preview URLs will become publicly accessible again.")) return;
    setSavingProtection(true);
    try {
      await api.delete(`/project/${projectId}/protection`);
      setProtectionEnabled(false);
      toast.success("Preview protection disabled");
    } catch {
      toast.error("Failed to disable preview protection");
    } finally {
      setSavingProtection(false);
    }
  }

  async function savePreviewDb(e: React.FormEvent) {
    e.preventDefault();
    setSavingPreviewDb(true);
    try {
      await api.patch(`/project/${projectId}`, { previewDbProvisionWebhookUrl: previewDbUrl.trim() || null });
      toast.success(previewDbUrl.trim() ? "Preview database provisioning enabled" : "Preview database provisioning disabled");
    } catch {
      toast.error("Failed to save preview database webhook");
    } finally {
      setSavingPreviewDb(false);
    }
  }

  async function saveErrorPages(e: React.FormEvent) {
    e.preventDefault();
    setSavingErrorPages(true);
    try {
      await api.patch(`/project/${projectId}`, {
        custom404Html: custom404Html.trim() || null,
        custom500Html: custom500Html.trim() || null,
      });
      toast.success("Error pages saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save error pages");
    } finally {
      setSavingErrorPages(false);
    }
  }

  async function exportConfig() {
    setExporting(true);
    try {
      const res = await api.get(`/project/${projectId}/export`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deployr-config-${projectId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Config exported");
    } catch {
      toast.error("Failed to export config");
    } finally {
      setExporting(false);
    }
  }

  async function importConfig(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      const res = await api.post(`/project/${projectId}/import`, config);
      toast.success(`Config imported${res.data.envVarsCreated ? ` — ${res.data.envVarsCreated} env var key(s) added (empty, need values)` : ""}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to import config — is this a valid Deployr config file?");
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

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

      {/* Preview deployment protection */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck size={16} className="text-indigo-500" />
            Preview Deployment Protection
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Require a password before anyone can view this project's preview URLs. Production is never affected.
          </p>
        </div>

        {protectionLoaded && (
          protectionEnabled ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck size={14} />
                Protection enabled
              </span>
              <Button variant="ghost" size="sm"
                onClick={disableProtection} disabled={savingProtection}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 text-xs">
                <X size={13} className="mr-1.5" />
                {savingProtection ? "Disabling…" : "Disable"}
              </Button>
            </div>
          ) : (
            <form onSubmit={enableProtection} className="space-y-3">
              <Input
                type="password"
                placeholder="Preview password (min. 6 characters)"
                value={protectionPassword}
                onChange={e => setProtectionPassword(e.target.value)}
                minLength={6}
                required
              />
              <Button type="submit" disabled={savingProtection} variant="outline">
                <ShieldCheck size={14} className="mr-2" />
                {savingProtection ? "Enabling…" : "Enable Protection"}
              </Button>
            </form>
          )
        )}
      </Card>

      {/* Managed storage add-ons */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Webhook size={16} className="text-indigo-500" />
            Managed Storage Add-ons
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            A persistent Postgres/Redis/KV/blob connection injected into every build (production,
            preview, and staging alike) — distinct from the ephemeral per-preview databases below.
            Paste a connection string from your own provider (Neon, Upstash, S3, etc.).
          </p>
        </div>

        {addons.length > 0 && (
          <div className="space-y-2">
            {addons.map((addon) => (
              <div key={addon.id} className="flex items-center justify-between text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium">{addon.name}</span>
                  <span className="text-xs text-zinc-400 ml-2">{addon.type} · <code className="font-mono">{addon.envVarKey}</code></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${addon.status === "provisioned" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                    {addon.status}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => removeAddon(addon.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 h-7 w-7">
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={createAddon} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={newAddonType}
              onChange={(e) => setNewAddonType(e.target.value as StorageAddon["type"])}
              className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-transparent"
            >
              <option value="postgres">Postgres</option>
              <option value="redis">Redis</option>
              <option value="kv">KV</option>
              <option value="blob">Blob storage</option>
            </select>
            <Input placeholder="Name" value={newAddonName} onChange={(e) => setNewAddonName(e.target.value)} className="text-sm" />
            <Input placeholder="ENV_VAR_KEY" value={newAddonEnvKey} onChange={(e) => setNewAddonEnvKey(e.target.value)} className="text-sm font-mono" />
          </div>
          <Input type="password" placeholder="Connection string" value={newAddonConnString} onChange={(e) => setNewAddonConnString(e.target.value)} className="font-mono text-sm" />
          <Button type="submit" disabled={creatingAddon} variant="outline">
            <Save size={14} className="mr-2" />
            {creatingAddon ? "Connecting…" : "Connect Add-on"}
          </Button>
        </form>
      </Card>

      {/* Ephemeral preview databases */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Webhook size={16} className="text-indigo-500" />
            Preview Database Provisioning
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            On every preview deployment, Deployr POSTs <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">{`{ action: "create", projectId, deploymentId, branch }`}</code> here
            and expects back <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">{`{ envVar, value }`}</code> — a connection string injected into just that build.
            Deployr doesn't integrate with a specific database provider; plug in your own Neon/PlanetScale/RDS branching service here.
          </p>
        </div>
        <form onSubmit={savePreviewDb} className="space-y-3">
          <Input
            type="url"
            placeholder="https://your-db-provisioner.example.com/hook"
            value={previewDbUrl}
            onChange={e => setPreviewDbUrl(e.target.value)}
            className="font-mono text-sm"
          />
          <Button type="submit" disabled={savingPreviewDb} variant="outline">
            <Save size={14} className="mr-2" />
            {savingPreviewDb ? "Saving…" : "Save"}
          </Button>
        </form>
      </Card>

      {/* Custom error pages */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <CalendarClock size={16} className="text-indigo-500" />
            Custom Error Pages
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Override the 404 (missing page/asset) or 500 (server error) page your visitors see.
            Leave blank to use Deployr's built-in animated error page.
          </p>
        </div>
        <form onSubmit={saveErrorPages} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">404 page HTML</label>
            <textarea
              value={custom404Html}
              onChange={e => setCustom404Html(e.target.value)}
              placeholder="<!doctype html>... (leave blank for the default animated page)"
              rows={4}
              className="w-full text-xs font-mono border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">500 page HTML</label>
            <textarea
              value={custom500Html}
              onChange={e => setCustom500Html(e.target.value)}
              placeholder="<!doctype html>... (leave blank for the default animated page)"
              rows={4}
              className="w-full text-xs font-mono border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
            />
          </div>
          <Button type="submit" disabled={savingErrorPages} variant="outline">
            <Save size={14} className="mr-2" />
            {savingErrorPages ? "Saving…" : "Save Error Pages"}
          </Button>
        </form>
      </Card>

      {/* Config export/import */}
      <Card className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Download size={16} className="text-indigo-500" />
            Export / Import Config
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Export this project's build config, error pages, blackout windows, and webhook URLs
            as JSON — useful for replicating settings onto another project or keeping a backup.
            Environment variable <em>keys</em> are included; values never are, since they're secrets.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={exportConfig} disabled={exporting}>
            <Download size={14} className="mr-2" />
            {exporting ? "Exporting…" : "Export Config"}
          </Button>
          <Button type="button" variant="outline" onClick={() => importFileRef.current?.click()} disabled={importing}>
            <Upload size={14} className="mr-2" />
            {importing ? "Importing…" : "Import Config"}
          </Button>
          <input ref={importFileRef} type="file" accept="application/json" className="hidden" onChange={importConfig} />
        </div>
      </Card>

      {orgs.length > 0 && (
        <Card className="p-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div>
            <h2 className="text-base font-semibold">Transfer Project</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Move this project between your personal account and a team you own. You must be an
              owner of the destination team.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={transferTarget}
              onChange={e => setTransferTarget(e.target.value)}
              className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-transparent"
            >
              <option value="personal" disabled={!currentOrgId}>
                Personal account{!currentOrgId ? " (current)" : ""}
              </option>
              {orgs.map(o => (
                <option key={o.id} value={o.id} disabled={o.id === currentOrgId}>
                  {o.name}{o.id === currentOrgId ? " (current)" : o.role !== "OWNER" ? " (owner-only)" : ""}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={transferProject}
              disabled={transferring || transferTarget === (currentOrgId ?? "personal")}
              variant="outline"
              className="shrink-0"
            >
              {transferring ? "Transferring…" : "Transfer"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}