"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Loader2, MousePointerClick, Zap, CheckCircle2, Layers, HardDrive, Clock, Wifi } from "lucide-react";

type DashboardData = {
  deploymentsCount?: number;
  avgBuildMs?: number;
  totalRequests?: number;
  successRate?: number;
  avgLatencyMs?: number;
  cacheHitRate?: number;
  bandwidthGB?: number;
  trend?: { date: string; requests: number }[];
  byProject?: { projectId: string; projectName: string; requests: number; avgLatencyMs: number }[];
};

// Legacy shape from /usage endpoint
type UsageData = {
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  cacheHitRate: number;
  byProject: { projectId: string; projectName: string; requests: number; avgLatencyMs: number }[];
  trend: { date: string; requests: number }[];
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "indigo",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  const accentMap: Record<string, string> = {
    indigo: "text-indigo-500 bg-indigo-100 dark:bg-indigo-500/10",
    emerald: "text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10",
    amber: "text-amber-500 bg-amber-100 dark:bg-amber-500/10",
    blue: "text-blue-500 bg-blue-100 dark:bg-blue-500/10",
    violet: "text-violet-500 bg-violet-100 dark:bg-violet-500/10",
    sky: "text-sky-500 bg-sky-100 dark:bg-sky-500/10",
  };
  return (
    <Card className="p-5 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${accentMap[accent] ?? accentMap.indigo}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 leading-none">{value}</p>
      <p className="text-xs font-medium text-zinc-500 mt-1.5">{label}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </Card>
  );
}

// Simple inline SVG bar chart — no external library
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 700;
  const h = 180;
  const pad = { top: 10, right: 10, bottom: 36, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const barW = Math.max(4, (chartW / data.length) * 0.6);
  const gap = chartW / data.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 180 }}>
      {/* Y gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = pad.top + chartH * (1 - frac);
        return (
          <g key={frac}>
            <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="currentColor" strokeOpacity={0.08} />
            <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.4}>
              {Math.round(max * frac).toLocaleString()}
            </text>
          </g>
        );
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / max) * chartH);
        const x = pad.left + gap * i + (gap - barW) / 2;
        const y = pad.top + chartH - barH;
        const labelEvery = Math.ceil(data.length / 10);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill="#6366f1" fillOpacity={0.8} />
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={h - pad.bottom + 14} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.5}>
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function UsagePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try analytics/dashboard first, fall back to /usage
    api.get("/analytics/dashboard")
      .then((res) => setData(res.data))
      .catch(() => api.get("/usage").then((res) => setData(res.data as UsageData)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-20">
        <div className="h-10 w-48 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48 text-red-500 text-sm">
        Failed to load usage data.
      </div>
    );
  }

  // Derive build minutes
  const buildMinutes =
    data.deploymentsCount != null && data.avgBuildMs != null
      ? Math.round((data.deploymentsCount * data.avgBuildMs) / 60000)
      : null;

  const trendData = (data.trend ?? []).map((row) => ({
    label: new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: row.requests,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Usage
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Aggregated metrics across all your projects — last 30 days.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {data.totalRequests != null && (
          <KpiCard icon={MousePointerClick} label="Total Requests" value={data.totalRequests.toLocaleString()} accent="indigo" />
        )}
        {data.successRate != null && (
          <KpiCard icon={CheckCircle2} label="Success Rate" value={`${data.successRate}%`} sub="HTTP < 400" accent="emerald" />
        )}
        {data.avgLatencyMs != null && (
          <KpiCard icon={Zap} label="Avg Latency" value={`${data.avgLatencyMs}ms`} accent="amber" />
        )}
        {data.cacheHitRate != null && (
          <KpiCard icon={Layers} label="Cache Hit Rate" value={`${data.cacheHitRate}%`} accent="blue" />
        )}
        {buildMinutes != null && (
          <KpiCard icon={Clock} label="Build Minutes" value={buildMinutes.toLocaleString()} sub={`${data.deploymentsCount} deploys`} accent="violet" />
        )}
        {data.bandwidthGB != null && (
          <KpiCard icon={Wifi} label="Bandwidth" value={`${data.bandwidthGB.toFixed(1)} GB`} accent="sky" />
        )}
      </div>

      {/* Trend chart */}
      {trendData.length > 0 && (
        <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md shadow-sm">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Daily Requests</p>
          <BarChart data={trendData} />
        </Card>
      )}

      {/* By project table */}
      {(data.byProject ?? []).length > 0 && (
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-white/10">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">By Project</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100 dark:border-white/10">
                <th className="px-6 py-3 font-medium">Project</th>
                <th className="px-6 py-3 font-medium text-right">Requests</th>
                <th className="px-6 py-3 font-medium text-right">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {(data.byProject ?? [])
                .sort((a, b) => b.requests - a.requests)
                .map((row, i) => (
                  <tr
                    key={row.projectId}
                    className={`border-b border-zinc-50 dark:border-white/5 last:border-0 ${i % 2 !== 0 ? "bg-zinc-50/50 dark:bg-white/[0.02]" : ""}`}
                  >
                    <td className="px-6 py-3 font-medium text-zinc-800 dark:text-zinc-200">{row.projectName}</td>
                    <td className="px-6 py-3 text-right text-zinc-600 dark:text-zinc-400">{row.requests.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-zinc-600 dark:text-zinc-400">{row.avgLatencyMs}ms</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
