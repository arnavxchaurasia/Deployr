"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, ArrowLeft, Loader2, RefreshCw } from "lucide-react";

type RequestLogRow = {
  id: string;
  path: string;
  status: number;
  latencyMs: number;
  cached: boolean;
  country: string | null;
  bytes: number;
  timestamp: string;
  deploymentId: string | null;
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "2xx", label: "2xx" },
  { value: "3xx", label: "3xx" },
  { value: "4xx", label: "4xx" },
  { value: "5xx", label: "5xx" },
];

function statusColor(status: number) {
  if (status >= 500) return "text-red-500";
  if (status >= 400) return "text-amber-500";
  if (status >= 300) return "text-blue-500";
  return "text-emerald-500";
}

export default function RequestLogsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [logs, setLogs] = useState<RequestLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [path, setPath] = useState("");
  const [status, setStatus] = useState("");
  const [since, setSince] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (path.trim()) params.path = path.trim();
      if (status) params.status = status;
      if (since) params.since = new Date(since).toISOString();

      const res = await api.get(`/project/${id}/request-logs`, { params });
      setLogs(res.data.logs);
    } catch {
      toast.error("Failed to load request logs");
    } finally {
      setLoading(false);
    }
  }, [id, path, status, since]);

  useEffect(() => { fetchLogs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="text-indigo-500" size={24} />
            Request Logs
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Search and filter raw request logs by path, status, and time.</p>
        </div>
      </div>

      <Card className="p-4 flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[180px] space-y-1.5">
          <label className="text-xs font-medium text-zinc-500">Path contains</label>
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/checkout" className="font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-500">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-transparent"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-500">Since</label>
          <input
            type="datetime-local"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 bg-transparent"
          />
        </div>
        <Button onClick={fetchLogs} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCw size={14} className="mr-2" />}
          {loading ? "Searching…" : "Search"}
        </Button>
      </Card>

      {loading ? (
        <div className="p-10 text-center text-zinc-500">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-14 text-center text-sm text-zinc-500">No requests match these filters.</Card>
      ) : (
        <div className="border border-zinc-200 dark:border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-white/5">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Path</th>
                <th className="px-4 py-3 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Latency</th>
                <th className="px-4 py-3 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Cached</th>
                <th className="px-4 py-3 font-semibold text-xs text-zinc-500 uppercase tracking-wider">Country</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {logs.map((l) => (
                <tr key={l.id} className="bg-white dark:bg-black/20">
                  <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs truncate max-w-[240px]" title={l.path}>{l.path}</td>
                  <td className={`px-4 py-3 font-mono text-xs font-semibold ${statusColor(l.status)}`}>{l.status}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{l.latencyMs}ms</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{l.cached ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{l.country || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
