"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ScanLine, CheckCircle2, AlertTriangle, ShieldAlert, Loader2, ChevronDown, RefreshCw } from "lucide-react";

type Project = { id: string; name: string };
type Severity = "low" | "medium" | "high" | "critical";
type ScanResult = {
  id: string;
  severity: Severity;
  location: string;
  ruleId: string;
  redactedValue: string;
  resolved: boolean;
  detectedAt: string;
};

const SEVERITY_STYLES: Record<Severity, string> = {
  low: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return "< 1h ago";
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SecretScanningPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchResults = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/project/${id}/secret-scanning`);
      setResults(res.data?.results ?? res.data ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchResults(selectedId); }, [selectedId, fetchResults]);

  async function handleScan() {
    if (!selectedId) return;
    setScanning(true);
    try {
      const res = await api.post(`/project/${selectedId}/secret-scanning/scan`, {});
      setResults(res.data?.results ?? []);
      toast.success("Scan complete");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleResolve(resultId: string) {
    if (!selectedId) return;
    setResolvingId(resultId);
    try {
      await api.patch(`/project/${selectedId}/secret-scanning/${resultId}`, { resolved: true });
      setResults((r) => r.map((x) => x.id === resultId ? { ...x, resolved: true } : x));
      toast.success("Marked as resolved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to mark resolved");
    } finally {
      setResolvingId(null);
    }
  }

  const total = results.length;
  const highCount = results.filter((r) => r.severity === "high" || r.severity === "critical").length;
  const unresolvedCount = results.filter((r) => !r.resolved).length;

  const selectCls = "h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none w-64";

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Secret Scanning
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Detect leaked credentials and secrets in your environment variables and build logs.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative">
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className={selectCls}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3 text-zinc-400 pointer-events-none" />
        </div>
        <Button
          onClick={handleScan}
          disabled={scanning}
          className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold"
        >
          {scanning ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <ScanLine size={14} className="mr-1.5" />}
          Scan env vars now
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Found", value: total, icon: <RefreshCw size={16} className="text-zinc-500" /> },
          { label: "High Severity", value: highCount, icon: <ShieldAlert size={16} className="text-red-500" /> },
          { label: "Unresolved", value: unresolvedCount, icon: <AlertTriangle size={16} className="text-amber-500" /> },
        ].map((s) => (
          <Card key={s.label} className="p-5 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              {s.icon}
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{s.label}</p>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 font-mono">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2">
          <ScanLine size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Scan Results</h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
        ) : results.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No secrets detected. Your project looks clean.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-white/5">
            {results.map((result) => (
              <div key={result.id} className={`p-5 flex items-start gap-4 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors ${result.resolved ? "opacity-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${SEVERITY_STYLES[result.severity]}`}>
                      {result.severity}
                    </span>
                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">{result.ruleId}</span>
                    {result.resolved && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={11} />resolved
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{result.location}</p>
                  <p className="font-mono text-xs text-zinc-400 mt-1">{result.redactedValue}</p>
                  <p className="text-[10px] text-zinc-400 mt-1">{formatRelative(result.detectedAt)}</p>
                </div>
                {!result.resolved && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleResolve(result.id)}
                    disabled={resolvingId === result.id}
                    className="h-7 px-3 text-xs rounded-lg shrink-0"
                  >
                    {resolvingId === result.id ? <Loader2 size={12} className="animate-spin" /> : "Mark resolved"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
