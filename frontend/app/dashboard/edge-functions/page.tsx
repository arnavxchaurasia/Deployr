"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Loader2, ChevronDown, X, Save } from "lucide-react";

type Project = { id: string; name: string };
type Runtime = "js" | "ts";
type EdgeFunction = {
  id: string;
  name: string;
  route: string;
  runtime: Runtime;
  enabled: boolean;
  code: string;
};

const RUNTIME_COLORS: Record<Runtime, string> = {
  js: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  ts: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
};

const DEFAULT_CODE = `// Edge function handler
export default async function handler(request) {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}`;

export default function EdgeFunctionsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [functions, setFunctions] = useState<EdgeFunction[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingFn, setEditingFn] = useState<EdgeFunction | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formRoute, setFormRoute] = useState("");
  const [formRuntime, setFormRuntime] = useState<Runtime>("js");
  const [formCode, setFormCode] = useState(DEFAULT_CODE);

  useEffect(() => {
    api.get("/projects").then((r) => {
      const list: Project[] = r.data?.projects ?? r.data ?? [];
      setProjects(list);
      if (list.length) setSelectedId(list[0].id);
    }).catch(() => toast.error("Failed to load projects"));
  }, []);

  const fetchFunctions = useCallback(async (id: string) => {
    setLoading(true);
    setEditingFn(null);
    setIsNew(false);
    try {
      const res = await api.get(`/project/${id}/edge-functions`);
      setFunctions(res.data ?? []);
    } catch {
      setFunctions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) fetchFunctions(selectedId); }, [selectedId, fetchFunctions]);

  function openNew() {
    setIsNew(true);
    setEditingFn(null);
    setFormName("");
    setFormRoute("");
    setFormRuntime("js");
    setFormCode(DEFAULT_CODE);
  }

  function openEdit(fn: EdgeFunction) {
    setIsNew(false);
    setEditingFn(fn);
    setFormName(fn.name);
    setFormRoute(fn.route);
    setFormRuntime(fn.runtime);
    setFormCode(fn.code);
  }

  function closeForm() {
    setIsNew(false);
    setEditingFn(null);
  }

  async function handleSave() {
    if (!selectedId || !formName.trim() || !formRoute.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.post(`/project/${selectedId}/edge-functions`, {
          name: formName.trim(),
          route: formRoute.trim(),
          runtime: formRuntime,
          code: formCode,
        });
        setFunctions((f) => [...f, res.data]);
        toast.success("Edge function created");
      } else if (editingFn) {
        const res = await api.put(`/project/${selectedId}/edge-functions/${editingFn.id}`, {
          name: formName.trim(),
          route: formRoute.trim(),
          runtime: formRuntime,
          code: formCode,
        });
        setFunctions((f) => f.map((x) => x.id === editingFn.id ? res.data : x));
        toast.success("Edge function updated");
      }
      closeForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save function");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(fn: EdgeFunction) {
    if (!selectedId) return;
    setTogglingId(fn.id);
    try {
      const res = await api.patch(`/project/${selectedId}/edge-functions/${fn.id}`, { enabled: !fn.enabled });
      setFunctions((f) => f.map((x) => x.id === fn.id ? { ...x, enabled: res.data?.enabled ?? !fn.enabled } : x));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update function");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!selectedId) return;
    setDeletingId(id);
    try {
      await api.delete(`/project/${selectedId}/edge-functions/${id}`);
      setFunctions((f) => f.filter((x) => x.id !== id));
      if (editingFn?.id === id) closeForm();
      toast.success("Function deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete function");
    } finally {
      setDeletingId(null);
    }
  }

  const selectCls = "h-10 pl-3 pr-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none";
  const showForm = isNew || !!editingFn;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Edge Functions
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Deploy lightweight JavaScript or TypeScript handlers that run at the edge, close to your users.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative">
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className={selectCls} style={{ width: 256 }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3 text-zinc-400 pointer-events-none" />
        </div>
        <Button
          onClick={openNew}
          className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold"
        >
          <Plus size={14} className="mr-1.5" />New Function
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {isNew ? "New Edge Function" : `Edit: ${editingFn?.name}`}
            </h3>
            <Button variant="ghost" size="sm" onClick={closeForm} className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-600">
              <X size={16} />
            </Button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Function Name</label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="my-function" className="h-9 rounded-xl text-sm bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Route Pattern</label>
                <Input value={formRoute} onChange={(e) => setFormRoute(e.target.value)} placeholder="/api/my-route" className="h-9 rounded-xl text-sm font-mono bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-white/10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Runtime</label>
              <div className="flex gap-2">
                {(["js", "ts"] as Runtime[]).map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => setFormRuntime(rt)}
                    className={`px-4 h-8 rounded-lg text-xs font-semibold border transition-all ${formRuntime === rt ? "bg-indigo-600 text-white border-indigo-600" : "border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-indigo-500/50"}`}
                  >
                    {rt === "js" ? "JavaScript" : "TypeScript"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Code</label>
              <textarea
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                rows={10}
                className="w-full rounded-xl text-xs font-mono p-3 bg-zinc-900 dark:bg-zinc-950 text-zinc-100 border border-zinc-700 dark:border-zinc-800 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
                spellCheck={false}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={closeForm} className="flex-1 h-9 rounded-xl text-sm">Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formRoute.trim()}
                className="flex-1 h-9 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
                {isNew ? "Create" : "Save changes"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* List */}
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2">
          <Zap size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Functions</h3>
          <Badge variant="secondary" className="ml-auto text-xs">{functions.length}</Badge>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
        ) : functions.length === 0 ? (
          <div className="p-10 text-center">
            <Zap size={32} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No edge functions yet.</p>
            <p className="text-xs text-zinc-400 mt-1">Click &quot;New Function&quot; to create one.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-white/5">
            {functions.map((fn) => (
              <div
                key={fn.id}
                className={`p-5 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer ${editingFn?.id === fn.id ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""}`}
                onClick={() => openEdit(fn)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{fn.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${RUNTIME_COLORS[fn.runtime]}`}>
                      {fn.runtime}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{fn.route}</p>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={fn.enabled}
                    onCheckedChange={() => handleToggle(fn)}
                    disabled={togglingId === fn.id}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(fn.id)}
                    disabled={deletingId === fn.id}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {deletingId === fn.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
