"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Activity, Globe, MousePointerClick, Zap } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type TrafficData = {
  totalRequests: number;
  cacheHitRate: number;
  successRate: number;
  trend: { date: string; requests: number }[];
  topPaths: { path: string; count: number }[];
  topCountries: { country: string; count: number }[];
};

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTraffic = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/traffic`);
      setData(res.data);
    } catch {
      console.error("Failed to fetch traffic data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTraffic();
  }, [fetchTraffic]);

  if (loading) return <div className="p-10">Loading advanced analytics...</div>;
  if (!data) return <div className="p-10 text-red-500">Failed to load analytics</div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <Activity className="text-blue-500" size={28} />
            Traffic & Edge Analytics
          </h1>
          <p className="text-zinc-500 mt-2">
            Real-time global edge telemetry for your project. (Last 7 Days)
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid sm:grid-cols-3 gap-6">
        <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900 dark:to-black">
          <div className="flex items-center gap-2 mb-2">
            <MousePointerClick className="text-blue-500" size={20} />
            <p className="text-sm font-medium text-zinc-500">Total Requests</p>
          </div>
          <p className="text-4xl font-bold">{data.totalRequests.toLocaleString()}</p>
        </Card>

        <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-black">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="text-emerald-500" size={20} />
            <p className="text-sm font-medium text-zinc-500">Cache Hit Rate</p>
          </div>
          <p className="text-4xl font-bold">{data.cacheHitRate}%</p>
        </Card>

        <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="text-purple-500" size={20} />
            <p className="text-sm font-medium text-zinc-500">Reliability</p>
          </div>
          <p className="text-4xl font-bold">{data.successRate}%</p>
        </Card>
      </div>

      {/* Chart */}
      <Card className="p-6 border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold mb-6">Traffic Trend</h2>
        <div className="h-80 w-full">
          {data.trend.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              No traffic data yet. Your edge proxy will track it instantly!
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6b7280' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6b7280' }} 
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="requests" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorReq)" 
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Breakdown Grids */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MousePointerClick size={18} /> Top Paths
          </h2>
          {data.topPaths.length === 0 ? (
            <p className="text-sm text-zinc-500">No data.</p>
          ) : (
            <ul className="space-y-4">
              {data.topPaths.map((p, i) => (
                <li key={i} className="flex justify-between items-center text-sm">
                  <span className="font-mono text-zinc-700 dark:text-zinc-300 truncate max-w-[250px]">{p.path}</span>
                  <span className="font-semibold">{p.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Globe size={18} /> Top Countries
          </h2>
          {data.topCountries.length === 0 ? (
            <p className="text-sm text-zinc-500">No data.</p>
          ) : (
            <ul className="space-y-4">
              {data.topCountries.map((c, i) => (
                <li key={i} className="flex justify-between items-center text-sm">
                  <span className="text-zinc-700 dark:text-zinc-300">{c.country || "Unknown"}</span>
                  <span className="font-semibold">{c.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
