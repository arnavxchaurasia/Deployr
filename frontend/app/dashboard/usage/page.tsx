"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { MousePointerClick, Zap, CheckCircle2, Layers } from "lucide-react";

type UsageData = {
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  cacheHitRate: number;
  byProject: { projectId: string; projectName: string; requests: number; avgLatencyMs: number }[];
  trend: { date: string; requests: number }[];
};

function KpiCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} className="text-indigo-500" />
        <p className="text-sm font-medium text-zinc-500">{label}</p>
      </div>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
    </Card>
  );
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/usage")
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="h-10 w-48 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
      <div className="grid sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />)}
      </div>
    </div>
  );

  if (!data) return <div className="p-10 text-red-500 text-sm">Failed to load usage data.</div>;

  const trendData = data.trend.map(row => ({
    date: new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    requests: row.requests,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Usage</h1>
        <p className="text-zinc-500 mt-1 text-sm">Aggregated request metrics across all your projects — last 30 days.</p>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <KpiCard icon={MousePointerClick} label="Total Requests" value={data.totalRequests.toLocaleString()} />
        <KpiCard icon={CheckCircle2} label="Success Rate" value={`${data.successRate}%`} sub="HTTP < 400" />
        <KpiCard icon={Zap} label="Avg Latency" value={`${data.avgLatencyMs}ms`} />
        <KpiCard icon={Layers} label="Cache Hit Rate" value={`${data.cacheHitRate}%`} />
      </div>

      {trendData.length > 0 && (
        <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Daily Requests</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="requests" stroke="#6366f1" fill="url(#grad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {data.byProject.length > 0 && (
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
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
              {data.byProject
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