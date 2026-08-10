"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Lock, ChevronDown, Loader2, AlertTriangle, Eye, EyeOff } from "lucide-react";

type Project = { id: string; name: string };

export default function PreviewProtectionPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
      setEnabled(res.data?.previewProtectionEnabled ?? false);
      setPassword("");
    } catch {
      setEnabled(false);
      setPassword("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchSettings(selectedId); }, [selectedId, fetchSettings]);

  async function handleSave() {
    if (!selectedId) return;
    if (enabled && !password.trim()) {
      toast.error("Enter a password for preview protection");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/project/${selectedId}/settings`, {
        previewProtectionEnabled: enabled,
        ...(enabled && password.trim() ? { previewProtectionPassword: password.trim() } : {}),
      });
      toast.success("Preview protection settings saved");
      setPassword("");
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
          Preview Protection
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Require a password to view preview deployments for this project.
        </p>
      </div>

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
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Lock size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Password Protection</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Visitors must enter a password before seeing preview URLs</p>
          </div>
          {loading ? (
            <Loader2 size={18} className="animate-spin text-zinc-400" />
          ) : (
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          )}
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            Preview protection adds a password prompt to all preview deployment URLs for this project.
            Production deployments are <strong>not</strong> affected. The password is stored as a
            plain-text header check — do not reuse sensitive passwords.
          </p>
        </div>

        {enabled && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Preview Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a new password (leave blank to keep existing)"
                className="h-11 rounded-xl pr-10 bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400">
              Leave blank to keep the existing password when toggling protection on.
            </p>
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || loading || !selectedId}
          className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/10"
        >
          {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </Card>
    </div>
  );
}
