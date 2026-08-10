"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bell, Plus, Trash2, Loader2, ChevronDown } from "lucide-react";

type Project = { id: string; name: string };
type Metric = "uptime" | "error_rate" | "build_failure" | "deploy_duration_ms";
type ChannelType = "email" | "slack";

type AlertRule = {
  id: string;
  name: string;
  metric: Metric;
  threshold: number;
  channelType: ChannelType;
  channelAddress: string;
  enabled: boolean;
};

const METRIC_LABELS: Record<Metric, string> = {
  uptime: "Uptime",
  error_rate: "Error Rate",
  build_failure: "Build Failure",
  deploy_duration_ms: "Deploy Duration",
};

const METRIC_COLORS: Record<Metric, string> = {
  uptime: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  error_rate: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  build_failure: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  deploy_duration_ms: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
};

export default function AlertingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [metric, setMetric] = useState<Metric>("uptime");
  const [threshold, setThreshold] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("email");
  const [channelAddress, setChannelAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchRules = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/project/${id}/alert-rules`);
      setRules(res.data ?? []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchRules(selectedId); }, [selectedId, fetchRules]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !name.trim() || !threshold || !channelAddress.trim()) return;
    setSaving(true);
    try {
      const res = await api.post(`/project/${selectedId}/alert-rules`, {
        name: name.trim(),
        metric,
        threshold: parseFloat(threshold),
        channelType,
        channelAddress: channelAddress.trim(),
      });
      setRules((r) => [...r, res.data]);
      setName(""); setThreshold(""); setChannelAddress("");
      setShowForm(false);
      toast.success("Alert rule created");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: AlertRule) {
    if (!selectedId) return;
    setTogglingId(rule.id);
    try {
      const res = await api.patch(`/project/${selectedId}/alert-rules/${rule.id}`, { enabled: !rule.enabled });
      setRules((r) => r.map((x) => x.id === rule.id ? { ...x, enabled: res.data?.enabled ?? !rule.enabled } : x));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update rule");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!selectedId) return;
    setDeletingId(id);
    try {
      await api.delete(`/project/${selectedId}/alert-rules/${id}`);
      setRules((r) => r.filter((x) => x.id !== id));
      toast.success("Rule deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete rule");
    } finally {
      setDeletingId(null);
    }
  }

  const selectCls = "w-full h-9 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-900/30 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none";

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Alerting
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Configure alert rules to be notified when metrics exceed thresholds.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className={selectCls} style={{ width: 256 }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-2.5 text-zinc-400 pointer-events-none" />
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold"
        >
          <Plus size={14} className="mr-1.5" />New Rule
        </Button>
      </div>

      {showForm && (
        <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 mb-5">New Alert Rule</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Rule Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="High error rate" className="h-9 rounded-xl text-sm bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Metric</label>
                <div className="relative">
                  <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className={selectCls}>
                    {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
                      <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-2.5 text-zinc-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Threshold</label>
                <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 95" className="h-9 rounded-xl text-sm bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Channel</label>
                <div className="relative">
                  <select value={channelType} onChange={(e) => setChannelType(e.target.value as ChannelType)} className={selectCls}>
                    <option value="email">Email</option>
                    <option value="slack">Slack</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-2.5 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {channelType === "email" ? "Email Address" : "Slack Webhook URL"}
              </label>
              <Input
                value={channelAddress}
                onChange={(e) => setChannelAddress(e.target.value)}
                placeholder={channelType === "email" ? "alerts@example.com" : "https://hooks.slack.com/..."}
                className="h-9 rounded-xl text-sm bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-9 rounded-xl">Cancel</Button>
              <Button type="submit" disabled={saving || !name || !threshold || !channelAddress} className="flex-1 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                {saving ? <Loader2 size={14} className="animate-spin" /> : "Create Rule"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2">
          <Bell size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Alert Rules</h3>
          <Badge variant="secondary" className="ml-auto text-xs">{rules.length}</Badge>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
        ) : rules.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No alert rules configured yet.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-white/5">
            {rules.map((rule) => (
              <div key={rule.id} className="p-5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{rule.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${METRIC_COLORS[rule.metric]}`}>
                      {METRIC_LABELS[rule.metric]}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Threshold: <span className="font-mono font-semibold">{rule.threshold}</span> &middot; {rule.channelType === "email" ? "📧" : "💬"} {rule.channelAddress}
                  </p>
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={() => handleToggle(rule)}
                  disabled={togglingId === rule.id}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(rule.id)}
                  disabled={deletingId === rule.id}
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  {deletingId === rule.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
