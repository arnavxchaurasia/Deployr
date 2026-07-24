"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Rocket, GitBranch, CheckCircle2, AlertTriangle, Loader2, Clock,
  RefreshCw, Shield, Trash2, Key, Globe, Webhook, RotateCcw,
  FolderPlus, Lock, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityEntry = {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  status: "QUEUED" | "BUILDING" | "READY" | "FAILED";
  branch: string | null;
  trigger: string;
  commitHash: string | null;
  buildTimeMs: number | null;
  createdAt: string;
};

type AuditEntry = {
  id: string;
  action: string;
  projectId: string | null;
  projectName: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(ms: number | null) {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Activity tab ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ActivityEntry["status"] }) {
  if (status === "READY")    return <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />;
  if (status === "FAILED")   return <AlertTriangle size={16} className="text-red-500 shrink-0" />;
  if (status === "BUILDING") return <Loader2 size={16} className="animate-spin text-blue-500 shrink-0" />;
  return <Clock size={16} className="text-zinc-400 shrink-0" />;
}

function ActivityTab() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/activity?limit=50");
      setEntries(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton />;

  if (entries.length === 0) return (
    <Card className="p-16 text-center border-dashed rounded-2xl">
      <Rocket size={40} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
      <p className="font-semibold text-zinc-700 dark:text-zinc-300">No deployments yet</p>
      <p className="text-sm text-zinc-500 mt-1">Push to a connected repository to trigger your first build.</p>
    </Card>
  );

  return (
    <div className="space-y-2">
      {entries.map(entry => (
        <Link
          key={entry.id}
          href={`/dashboard/projects/${entry.projectId}`}
          className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-white/10 hover:border-indigo-500/40 transition-all group"
        >
          <StatusIcon status={entry.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {entry.projectName}
              </span>
              {entry.branch && (
                <span className="flex items-center gap-1 text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                  <GitBranch size={11} />
                  {entry.branch}
                </span>
              )}
              {entry.commitHash && (
                <span className="text-xs text-zinc-400 font-mono">{entry.commitHash.slice(0, 7)}</span>
              )}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {entry.trigger.toLowerCase()} · {formatRelative(entry.createdAt)}
              {formatDuration(entry.buildTimeMs) && ` · ${formatDuration(entry.buildTimeMs)}`}
            </div>
          </div>
          <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${
            entry.status === "READY"    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
            entry.status === "FAILED"   ? "bg-red-500/10 text-red-600 border-red-500/20" :
            entry.status === "BUILDING" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                          "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
          }`}>
            {entry.status}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ── Audit log tab ─────────────────────────────────────────────────────────────

const AUDIT_ICONS: Record<string, React.ReactNode> = {
  "project.created":         <FolderPlus size={15} className="text-indigo-500" />,
  "project.deleted":         <Trash2     size={15} className="text-red-500" />,
  "project.settings_updated":<ChevronRight size={15} className="text-zinc-400" />,
  "deployment.triggered":    <Rocket     size={15} className="text-blue-500" />,
  "deployment.promoted":     <CheckCircle2 size={15} className="text-emerald-500" />,
  "deployment.rolled_back":  <RotateCcw  size={15} className="text-amber-500" />,
  "env.added":               <Lock       size={15} className="text-violet-500" />,
  "env.deleted":             <Lock       size={15} className="text-red-400" />,
  "domain.added":            <Globe      size={15} className="text-cyan-500" />,
  "domain.verified":         <Globe      size={15} className="text-emerald-500" />,
  "domain.removed":          <Globe      size={15} className="text-red-400" />,
  "deploy_hook.created":     <Webhook    size={15} className="text-indigo-400" />,
  "deploy_hook.revoked":     <Webhook    size={15} className="text-red-400" />,
  "member.invited":          <Key        size={15} className="text-amber-500" />,
  "member.removed":          <Shield     size={15} className="text-red-400" />,
};

const AUDIT_LABELS: Record<string, (meta: Record<string, unknown> | null) => string> = {
  "project.created":         ()   => "Project created",
  "project.deleted":         ()   => "Project deleted",
  "project.settings_updated":()   => "Settings updated",
  "deployment.triggered":    (m)  => `Deploy triggered on ${m?.branch ?? "main"}`,
  "deployment.promoted":     ()   => "Deployment promoted to production",
  "deployment.rolled_back":  (m)  => `Rolled back to deployment on ${m?.branch ?? "main"}`,
  "env.added":               (m)  => `Secret added: ${m?.key ?? ""}`,
  "env.deleted":             (m)  => `Secret deleted: ${m?.key ?? ""}`,
  "domain.added":            (m)  => `Domain added: ${m?.domain ?? ""}`,
  "domain.verified":         ()   => "Custom domain verified",
  "domain.removed":          ()   => "Custom domain removed",
  "deploy_hook.created":     ()   => "Deploy hook created",
  "deploy_hook.revoked":     ()   => "Deploy hook revoked",
  "member.invited":          (m)  => `Invited ${m?.email ?? "member"}`,
  "member.removed":          ()   => "Member removed",
};

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/audit-log?limit=100");
      setEntries(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton />;

  if (entries.length === 0) return (
    <Card className="p-16 text-center border-dashed rounded-2xl">
      <Shield size={40} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
      <p className="font-semibold text-zinc-700 dark:text-zinc-300">No audit events yet</p>
      <p className="text-sm text-zinc-500 mt-1">Actions like deploys, config changes, and team invites appear here.</p>
    </Card>
  );

  return (
    <div className="space-y-1">
      {entries.map(entry => {
        const icon  = AUDIT_ICONS[entry.action]  ?? <ChevronRight size={15} className="text-zinc-400" />;
        const label = AUDIT_LABELS[entry.action]?.(entry.meta) ?? entry.action;
        return (
          <div
            key={entry.id}
            className="flex items-center gap-4 px-5 py-3.5 rounded-xl bg-white/60 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-white/10"
          >
            <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
              {entry.projectName && (
                <p className="text-xs text-zinc-400 mt-0.5">{entry.projectName}</p>
              )}
            </div>
            <span className="text-xs text-zinc-400 shrink-0">{formatRelative(entry.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "deployments", label: "Deployments" },
  { id: "audit",       label: "Audit Log" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function ActivityPage() {
  const [tab, setTab] = useState<Tab>("deployments");
  const [, setRefresh] = useState(0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Activity</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            {tab === "deployments"
              ? "All deployments across your projects, newest first."
              : "Settings changes, team actions, and key events."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefresh(n => n + 1)} className="gap-2 rounded-xl">
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-white/10">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.id
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "deployments" ? <ActivityTab /> : <AuditTab />}
    </div>
  );
}