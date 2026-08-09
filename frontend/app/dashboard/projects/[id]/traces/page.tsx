"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2, GitBranch, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";

type TraceSummary = {
  traceId: string;
  rootName: string;
  spanCount: number;
  durationMs: number;
  hasError: boolean;
  startTime: string;
};

type Span = {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: string | null;
};

export default function TracesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [loadingSpans, setLoadingSpans] = useState(false);

  const fetchTraces = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/traces`);
      setTraces(res.data);
    } catch {
      // optional feature — no traces ingested yet is not an error
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchTraces(); }, [fetchTraces]);

  async function openTrace(traceId: string) {
    setSelectedTraceId(traceId);
    setLoadingSpans(true);
    try {
      const res = await api.get(`/project/${id}/traces/${traceId}`);
      setSpans(res.data);
    } catch {
      toast.error("Failed to load trace");
    } finally {
      setLoadingSpans(false);
    }
  }

  const traceStart = spans.length ? Math.min(...spans.map((s) => new Date(s.startTime).getTime())) : 0;
  const traceDuration = spans.length ? Math.max(...spans.map((s) => new Date(s.endTime).getTime())) - traceStart : 0;

  function copyIngestUrl() {
    const url = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/traces`;
    navigator.clipboard.writeText(url);
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
            <GitBranch className="text-indigo-500" size={24} />
            Traces
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Distributed traces ingested from your own function instrumentation.
          </p>
        </div>
      </div>

      <Card className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-3">
        <h2 className="text-base font-semibold">Ingest endpoint</h2>
        <p className="text-xs text-zinc-500">
          POST a batch of spans here from your function code —{" "}
          <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{`{ projectId: "${id}", spans: [{ traceId, spanId, parentSpanId, name, startTime, endTime, status }] }`}</code>.
          Not a full OpenTelemetry Collector — a lightweight JSON ingest, rendered as a waterfall below.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg overflow-x-auto block">
            POST {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/traces
          </code>
          <Button variant="outline" size="icon" onClick={copyIngestUrl}>
            <Copy size={14} />
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="p-10 text-center text-zinc-500">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : traces.length === 0 ? (
        <Card className="p-14 text-center text-sm text-zinc-500 border-dashed">No traces ingested yet.</Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            {traces.map((t) => (
              <button
                key={t.traceId}
                onClick={() => openTrace(t.traceId)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-colors ${
                  selectedTraceId === t.traceId
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                    : "border-zinc-200 dark:border-zinc-700 hover:border-indigo-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{t.rootName}</span>
                  {t.hasError && <AlertTriangle size={13} className="text-red-500 shrink-0" />}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {t.spanCount} span{t.spanCount !== 1 ? "s" : ""} · {t.durationMs}ms · {new Date(t.startTime).toLocaleTimeString()}
                </div>
              </button>
            ))}
          </div>

          <Card className="p-4">
            {!selectedTraceId ? (
              <p className="text-sm text-zinc-400 text-center py-10">Select a trace to view its waterfall.</p>
            ) : loadingSpans ? (
              <Loader2 size={20} className="animate-spin mx-auto text-zinc-400" />
            ) : (
              <div className="space-y-2">
                {spans.map((s) => {
                  const offset = traceDuration > 0 ? ((new Date(s.startTime).getTime() - traceStart) / traceDuration) * 100 : 0;
                  const width = traceDuration > 0 ? Math.max((s.durationMs / traceDuration) * 100, 1) : 100;
                  return (
                    <div key={s.id} className="text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span className={s.status === "error" ? "text-red-500 font-medium" : "font-medium"}>{s.name}</span>
                        <span className="text-zinc-400">{s.durationMs}ms</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded relative">
                        <div
                          className={`h-2 rounded absolute ${s.status === "error" ? "bg-red-500" : "bg-indigo-500"}`}
                          style={{ left: `${offset}%`, width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
