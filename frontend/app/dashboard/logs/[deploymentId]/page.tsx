"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { socket as sharedSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Terminal,
  Activity,
  Box
} from "lucide-react";
import { motion } from "framer-motion";

type DeploymentMeta = {
  id: string;
  status: "QUEUED" | "BUILDING" | "READY" | "FAILED";
  isProduction: boolean;
  projectId?: string;
};

type LogRow = {
  log: string;
  timestamp: string;
};

function StatusBadge({ meta }: { meta: DeploymentMeta | null }) {
  if (!meta) return null;

  if (meta.status === "READY")
    return (
      <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        {meta.isProduction ? "Production" : "Ready"}
      </span>
    );

  if (meta.status === "BUILDING")
    return (
      <span className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
        <Loader2 size={12} className="animate-spin" />
        Building
      </span>
    );

  if (meta.status === "FAILED")
    return (
      <span className="flex items-center gap-1.5 bg-red-500/10 text-red-650 dark:text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
        <AlertTriangle size={12} />
        Failed
      </span>
    );

  return (
    <span className="flex items-center gap-1.5 bg-zinc-500/10 text-zinc-650 dark:text-zinc-400 border border-zinc-500/20 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
      Queued
    </span>
  );
}

export default function LogsPage() {
  const params = useParams();
  const router = useRouter();
  const deploymentId = params?.deploymentId as string;

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [meta, setMeta] = useState<DeploymentMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const logEndRef = useRef<HTMLDivElement | null>(null);

  const fetchMeta = useCallback(async () => {
    try {
      const res = await api.get(`/deployment/${deploymentId}`);
      const d = res.data.data;
      setMeta({
        id: d.id,
        status: d.status,
        isProduction: d.isProduction,
        projectId: d.projectId,
      });
    } catch {
      // deployment may not exist yet
    }
  }, [deploymentId]);

  useEffect(() => {
    if (!deploymentId) return;

    let cancelled = false;

    async function init() {
      try {
        const res = await api.get(`/logs/${deploymentId}`);
        if (cancelled) return;

        setLogs(res.data.logs ?? []);
      } catch (err) {
        console.error("Failed to load log history", err);
      }

      try {
        await fetchMeta();
      } catch (err) {
        console.error("Failed to load meta", err);
      }
      
      if (!cancelled) setLoading(false);

      sharedSocket.connect();
      sharedSocket.emit("subscribe", deploymentId);

      sharedSocket.on("message", (data: LogRow) => {
        if (!data?.log || !data?.timestamp) return;

        setLogs(prev => [
          ...prev,
          {
            log: data.log,
            timestamp: data.timestamp,
          },
        ]);
      });
    }

    init();

    const interval = setInterval(fetchMeta, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      sharedSocket.off("message");
      sharedSocket.disconnect();
    };
  }, [deploymentId, fetchMeta]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 p-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-10 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
        </div>
        <div className="h-[600px] w-full bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-20">
      {/* Console Top Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
        <button onClick={() => router.back()} className="hover:text-zinc-900 dark:hover:text-white transition-colors">Project</button>
        <span>/</span>
        <span className="text-zinc-650 dark:text-zinc-200">Deployment Logs</span>
      </div>

      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-zinc-150 dark:border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
              Deployment Terminal
            </h1>
            <StatusBadge meta={meta} />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 flex items-center gap-1">
            <Box size={12} />
            Build ID: <span className="font-mono bg-zinc-100 dark:bg-white/5 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-350">{deploymentId.slice(0, 12)}...</span>
          </p>
        </div>

        <Button 
          variant="outline" 
          onClick={() => router.back()}
          className="bg-white/50 dark:bg-black/20 border-zinc-200 dark:border-white/10 rounded-xl h-11 px-5 font-semibold"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Overview
        </Button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-2xl overflow-hidden relative"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="px-4 py-3.5 border-b border-zinc-150 dark:border-white/5 bg-zinc-50/80 dark:bg-zinc-900/80 flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              <span className="w-3 h-3 rounded-full bg-red-500/80 border border-red-650/10" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80 border border-yellow-650/10" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-650/10" />
            </div>
            <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />
            <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
              <Terminal size={12} />
              build-output.log
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
              <Activity size={10} className="animate-pulse" />
              Live Stream
            </span>
          </div>
        </div>

        <div className="bg-[#0c0c0e] w-full p-4 md:p-6 h-[600px] overflow-auto font-mono text-sm leading-relaxed shadow-inner">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
              <Loader2 size={32} className="animate-spin text-zinc-700" />
              <p className="text-xs tracking-wider uppercase">Waiting for logs...</p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((row, i) => {
                // very basic log colorization heuristics
                let colorClass = "text-zinc-300";
                const text = row.log.toLowerCase();
                if (text.includes("error") || text.includes("fail")) colorClass = "text-red-400 font-medium";
                else if (text.includes("warn")) colorClass = "text-yellow-400";
                else if (text.includes("success") || text.includes("ready") || text.includes("done")) colorClass = "text-emerald-400 font-medium";
                else if (text.includes("build") || text.includes("install") || text.includes("info")) colorClass = "text-blue-400";

                return (
                  <div key={i} className={`whitespace-pre-wrap break-all flex gap-4 ${colorClass}`}>
                    <span className="text-zinc-700 shrink-0 select-none hidden sm:inline-block">
                      {row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], { hour12: false }) : ""}
                    </span>
                    <span className="flex-1">{row.log}</span>
                  </div>
                );
              })}
              <div ref={logEndRef} className="h-4" />
            </div>
          )}
        </div>
      </motion.div>

      <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 text-center opacity-60">
        Secure WebSocket Stream • End-to-End Encrypted
      </div>
    </div>
  );
}
