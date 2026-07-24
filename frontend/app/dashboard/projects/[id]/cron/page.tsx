"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Clock,
  Plus,
  Trash2,
  ArrowLeft,
  Loader2,
  Globe,
  Webhook,
  CheckCircle2,
  XCircle,
  Power,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type CronJob = {
  id: string;
  name: string;
  expression: string;
  endpoint: string | null;
  useHook: boolean;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
        Never ran
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 size={10} />
        Success
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
      <XCircle size={10} />
      Failed
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ── Common expressions helper ─────────────────────────────────────────────────

const EXAMPLES = [
  { label: "Every hour",       expr: "0 * * * *" },
  { label: "Every day at 2am", expr: "0 2 * * *" },
  { label: "Every Monday",     expr: "0 9 * * 1" },
  { label: "Every 6 hours",    expr: "0 */6 * * *" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CronPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [useHook, setUseHook] = useState(true);
  const [endpoint, setEndpoint] = useState("");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/cron`);
      setJobs(res.data);
    } catch {
      toast.error("Failed to load cron jobs");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !expression.trim()) return;
    setSaving(true);
    try {
      await api.post(`/project/${id}/cron`, {
        name: name.trim(),
        expression: expression.trim(),
        useHook,
        endpoint: useHook ? null : endpoint.trim(),
      });
      toast.success("Cron job created");
      setName("");
      setExpression("");
      setEndpoint("");
      setUseHook(true);
      await fetchJobs();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to create cron job";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(job: CronJob) {
    setTogglingId(job.id);
    try {
      await api.patch(`/project/${id}/cron/${job.id}`, { enabled: !job.enabled });
      setJobs(prev =>
        prev.map(j => (j.id === job.id ? { ...j, enabled: !j.enabled } : j))
      );
    } catch {
      toast.error("Failed to update cron job");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(jobId: string) {
    if (!confirm("Delete this cron job?")) return;
    setDeletingId(jobId);
    try {
      await api.delete(`/project/${id}/cron/${jobId}`);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      toast.success("Cron job deleted");
    } catch {
      toast.error("Failed to delete cron job");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="text-indigo-500" size={24} />
            Cron Jobs
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Schedule recurring deploys or HTTP calls on a cron expression.
          </p>
        </div>
      </div>

      {/* Add cron job form */}
      <Card className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Plus size={16} className="text-indigo-500" />
          Add Cron Job
        </h2>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Job Name
              </label>
              <Input
                placeholder="e.g. Nightly rebuild"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Cron Expression
              </label>
              <Input
                placeholder="0 * * * *"
                value={expression}
                onChange={e => setExpression(e.target.value)}
                className="font-mono"
                required
              />
            </div>
          </div>

          {/* Common expressions helper */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(ex => (
              <button
                type="button"
                key={ex.expr}
                onClick={() => setExpression(ex.expr)}
                className="text-[11px] px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-mono"
              >
                {ex.label}: <span className="text-indigo-500">{ex.expr}</span>
              </button>
            ))}
          </div>

          {/* Target toggle */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Trigger Target
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUseHook(true)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  useHook
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300"
                }`}
              >
                <Webhook size={15} />
                Deploy Hook
              </button>
              <button
                type="button"
                onClick={() => setUseHook(false)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  !useHook
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300"
                }`}
              >
                <Globe size={15} />
                Custom URL
              </button>
            </div>

            {useHook ? (
              <p className="text-xs text-zinc-500">
                Uses this project&apos;s deploy hook to trigger a new deployment. Make sure you have generated a deploy hook in{" "}
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/projects/${id}/settings?tab=integrations`)}
                  className="text-indigo-500 hover:underline"
                >
                  Settings → Integrations
                </button>
                .
              </p>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Endpoint URL
                </label>
                <Input
                  type="url"
                  placeholder="https://example.com/api/trigger"
                  value={endpoint}
                  onChange={e => setEndpoint(e.target.value)}
                  className="font-mono text-sm"
                  required={!useHook}
                />
                <p className="text-xs text-zinc-500">
                  Deployr will POST JSON with <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">jobId</code>,{" "}
                  <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">projectSlug</code>, and{" "}
                  <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">timestamp</code>.
                </p>
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={saving || !name.trim() || !expression.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus size={14} className="mr-2" />
                Create Cron Job
              </>
            )}
          </Button>
        </form>
      </Card>

      {/* Job list */}
      <div>
        <h2 className="text-base font-semibold mb-4">Scheduled Jobs</h2>

        {loading ? (
          <div className="p-10 text-center text-zinc-500">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-14 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-2xl text-center">
            <Clock size={36} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-500">No cron jobs yet</p>
            <p className="text-xs text-zinc-400 mt-1">
              Create a cron job above to schedule recurring deploys or HTTP calls.
            </p>
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-white/5">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3.5 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Schedule</th>
                  <th className="px-5 py-3.5 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Target</th>
                  <th className="px-5 py-3.5 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Last Run</th>
                  <th className="px-5 py-3.5 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-xs text-zinc-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                {jobs.map(job => (
                  <tr
                    key={job.id}
                    className={`bg-white dark:bg-black/20 transition-colors ${
                      !job.enabled ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-5 py-4 font-semibold text-zinc-800 dark:text-zinc-200">
                      {job.name}
                    </td>
                    <td className="px-5 py-4">
                      <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-indigo-600 dark:text-indigo-400">
                        {job.expression}
                      </code>
                    </td>
                    <td className="px-5 py-4 text-xs text-zinc-500">
                      {job.useHook ? (
                        <span className="flex items-center gap-1">
                          <Webhook size={12} className="text-indigo-400" />
                          Deploy Hook
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 truncate max-w-[160px]" title={job.endpoint ?? ""}>
                          <Globe size={12} className="text-zinc-400 shrink-0" />
                          {job.endpoint || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-zinc-500 whitespace-nowrap">
                      {formatDate(job.lastRunAt)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={job.lastStatus} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleEnabled(job)}
                          disabled={togglingId === job.id}
                          title={job.enabled ? "Disable" : "Enable"}
                          className={
                            job.enabled
                              ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                              : "text-zinc-400 hover:text-zinc-600"
                          }
                        >
                          {togglingId === job.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Power size={15} />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(job.id)}
                          disabled={deletingId === job.id}
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          {deletingId === job.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </Button>
                      </div>
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
