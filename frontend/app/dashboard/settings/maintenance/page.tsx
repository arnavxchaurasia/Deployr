"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { WrenchIcon, ChevronDown, Loader2, AlertTriangle } from "lucide-react";

type Project = { id: string; name: string };

export default function MaintenancePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchSettings = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/project/${id}`);
      setMaintenanceMode(res.data?.maintenanceMode ?? false);
      setMaintenanceMessage(res.data?.maintenanceMessage ?? "");
    } catch {
      setMaintenanceMode(false);
      setMaintenanceMessage("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchSettings(selectedId); }, [selectedId, fetchSettings]);

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.patch(`/project/${selectedId}/settings`, {
        maintenanceMode,
        maintenanceMessage: maintenanceMessage.trim() || null,
      });
      toast.success(maintenanceMode ? "Maintenance mode enabled" : "Maintenance mode disabled");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const selectCls =
    "w-full h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none";

  return (
    <div className="max-w-2xl space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Maintenance Mode
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Temporarily take your project offline and show a maintenance message to visitors.
        </p>
      </div>

      {/* Active warning banner */}
      {maintenanceMode && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Maintenance mode is active</p>
            <p className="text-xs mt-0.5 opacity-80">
              All incoming requests to this project are returning the maintenance page.
            </p>
          </div>
        </div>
      )}

      {/* Project selector */}
      <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-2">
          Project
        </label>
        <div className="relative">
          <select
            className={selectCls}
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
      </Card>

      <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
            <WrenchIcon size={18} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Enable Maintenance Mode</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Serve a maintenance page to all visitors</p>
          </div>
          {loading ? (
            <Loader2 size={18} className="animate-spin text-zinc-400" />
          ) : (
            <Switch
              checked={maintenanceMode}
              onCheckedChange={setMaintenanceMode}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Custom Message <span className="normal-case font-normal">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={maintenanceMessage}
            onChange={(e) => setMaintenanceMessage(e.target.value)}
            placeholder="We're performing scheduled maintenance. We'll be back shortly."
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-900/30 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[10px] text-zinc-400">
            Displayed on the maintenance page. Leave blank to use the default message.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || loading || !selectedId}
          className={`w-full h-11 rounded-xl font-semibold shadow-md ${
            maintenanceMode
              ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/10"
              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/10"
          }`}
        >
          {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
          {maintenanceMode ? "Enable Maintenance Mode" : "Disable Maintenance Mode"}
        </Button>
      </Card>
    </div>
  );
}
