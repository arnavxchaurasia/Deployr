"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import io from "socket.io-client";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  Rocket,
  Trash2,
  Zap,
  ExternalLink,
  Copy,
} from "lucide-react";

type LogRow = {
  log: string;
};

type DeploymentMeta = {
  id: string;
  status: "QUEUED" | "BUILDING" | "READY" | "FAILED";
  isProduction: boolean;
};

export default function DeploymentLogsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [logs, setLogs] = useState<string[]>([]);
  const [meta, setMeta] = useState<DeploymentMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const logEndRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  const fetchMeta = useCallback(async () => {
    try {
      const res = await api.get(`/deployment/${id}`);
      const d = res.data.data;
      if (d) {
        setMeta({
          id: d.id,
          status: d.status,
          isProduction: d.isProduction,
        });
      }
    } catch (err) {
      console.error("Failed to fetch deployment meta:", err);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    let socket: ReturnType<typeof io> | null = null;

    async function init() {
      try {
        const res = await api.get(`/logs/${id}`);
        setLogs(res.data.logs.map((l: LogRow) => l.log));
      } catch (err) {
        console.error("Failed to load logs:", err);
      }

      await fetchMeta();
      setLoading(false);

      socket = io("http://localhost:9002");
      socket.emit("subscribe", id);

      socket.on("message", (msg: string) => {
        try {
          const data = JSON.parse(msg);
          setLogs(prev => [...prev, data.log]);
        } catch {}
      });
    }

    init();
    const interval = setInterval(fetchMeta, 4000);

    return () => {
      if (socket) socket.disconnect();
      clearInterval(interval);
    };
  }, [id, fetchMeta]);

  useEffect(() => {
    if (autoScrollRef.current) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  async function promote() {
    await api.post(`/deployments/${id}/promote`);
    await fetchMeta();
  }

  async function remove() {
    if (!confirm("Delete this deployment permanently?")) return;
    await api.delete(`/deployments/${id}`);
    router.back();
  }

  function statusBadge() {
    if (!meta) return null;

    switch (meta.status) {
      case "READY":
        return meta.isProduction ? (
          <span className="flex items-center gap-2 text-green-600">
            <CheckCircle size={16} /> Production
          </span>
        ) : (
          <span className="flex items-center gap-2 text-green-600">
            <CheckCircle size={16} /> Ready
          </span>
        );

      case "BUILDING":
        return (
          <span className="flex items-center gap-2 text-blue-600">
            <Loader2 size={16} className="animate-spin" /> Building
          </span>
        );

      case "QUEUED":
        return (
          <span className="flex items-center gap-2 text-zinc-500">
            <Loader2 size={16} /> Queued
          </span>
        );

      case "FAILED":
        return (
          <span className="flex items-center gap-2 text-red-600">
            <AlertTriangle size={16} /> Failed
          </span>
        );
    }
  }

  const functions = logs
    .filter(l => l.startsWith("FUNCTION_URL:"))
    .map(l => {
      const parts = l.replace("FUNCTION_URL:", "").split(":");
      const name = parts[0];
      const url = parts.slice(1).join(":");
      return { name, url };
    });

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  if (loading) {
    return <div className="p-10 text-zinc-500">Loading logs…</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Deployment Logs</h1>
          <div className="mt-2">{statusBadge()}</div>
        </div>

        {meta && (
          <div className="flex gap-2 flex-wrap">
            {meta.status === "READY" && !meta.isProduction && (
              <Button onClick={promote} className="gap-2">
                <Rocket size={16} />
                Promote to Production
              </Button>
            )}

            <Button
              variant="destructive"
              onClick={remove}
              className="gap-2"
            >
              <Trash2 size={16} />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Deployr Functions panel */}
      {functions.length > 0 && (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
            <Zap size={15} />
            Deployr Functions ({functions.length})
          </div>
          <div className="space-y-2">
            {functions.map(fn => (
              <div key={fn.name} className="flex items-center justify-between gap-4 rounded-xl bg-black/30 border border-zinc-800 px-4 py-2.5">
                <div>
                  <span className="text-xs font-mono font-semibold text-zinc-200">{fn.name}</span>
                  <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate max-w-sm">{fn.url}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyToClipboard(fn.url)}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Copy URL"
                  >
                    <Copy size={13} />
                  </button>
                  <a
                    href={fn.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Open function"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">
            Functions export a <code className="text-zinc-400 bg-zinc-800 px-1 rounded">handler</code> function from{" "}
            <code className="text-zinc-400 bg-zinc-800 px-1 rounded">functions/*.js</code> in your repository.
          </p>
        </div>
      )}

      {/* Logs */}
      <div
        className="relative bg-black rounded-2xl border border-zinc-800 overflow-hidden"
        onMouseEnter={() => (autoScrollRef.current = false)}
        onMouseLeave={() => (autoScrollRef.current = true)}
      >
        <div className="px-4 py-2 text-xs text-zinc-400 border-b border-zinc-800">
          Streaming logs
        </div>

        <div className="p-4 font-mono text-sm text-green-400 space-y-1 max-h-[520px] overflow-auto">
          {logs.length === 0 && (
            <div className="text-zinc-500">
              Waiting for logs…
            </div>
          )}

          {logs.map((log, i) => (
            <div key={i} className={`whitespace-pre-wrap ${log.startsWith("FUNCTION_URL:") ? "text-violet-400" : log.startsWith("error:") || log.includes("FATAL") ? "text-red-400" : log.includes("Build Complete") || log.includes("Done") ? "text-emerald-400" : ""}`}>
              {log}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
