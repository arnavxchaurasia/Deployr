"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FlaskConical, Plus, Trash2, ArrowLeft, Loader2, BarChart3 } from "lucide-react";

type Variant = { key: string; weight: number; pathOverride?: string | null };
type Experiment = {
  id: string;
  key: string;
  enabled: boolean;
  variants: Variant[];
  goalPath: string | null;
};
type VariantResult = { key: string; exposures: number; conversions: number; conversionRate: number | null };

export default function ExperimentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openResultsId, setOpenResultsId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VariantResult[]>>({});

  const [newKey, setNewKey] = useState("");
  const [newGoalPath, setNewGoalPath] = useState("");
  const [variantA, setVariantA] = useState("control");
  const [variantB, setVariantB] = useState("b");
  const [pathOverrideB, setPathOverrideB] = useState("");

  const fetchExperiments = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/experiments`);
      setExperiments(res.data);
    } catch {
      toast.error("Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchExperiments(); }, [fetchExperiments]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !variantA.trim() || !variantB.trim()) return;
    setCreating(true);
    try {
      await api.post(`/project/${id}/experiments`, {
        key: newKey.trim(),
        goalPath: newGoalPath.trim() || null,
        variants: [
          { key: variantA.trim(), weight: 50, pathOverride: null },
          { key: variantB.trim(), weight: 50, pathOverride: pathOverrideB.trim() || null },
        ],
      });
      toast.success("Experiment created");
      setNewKey(""); setNewGoalPath(""); setPathOverrideB("");
      await fetchExperiments();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create experiment");
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(exp: Experiment) {
    try {
      await api.patch(`/project/${id}/experiments/${exp.id}`, { enabled: !exp.enabled });
      setExperiments((prev) => prev.map((e) => (e.id === exp.id ? { ...e, enabled: !e.enabled } : e)));
    } catch {
      toast.error("Failed to update experiment");
    }
  }

  async function handleDelete(expId: string) {
    if (!confirm("Delete this experiment?")) return;
    try {
      await api.delete(`/project/${id}/experiments/${expId}`);
      setExperiments((prev) => prev.filter((e) => e.id !== expId));
      toast.success("Experiment deleted");
    } catch {
      toast.error("Failed to delete experiment");
    }
  }

  async function toggleResults(expId: string) {
    if (openResultsId === expId) {
      setOpenResultsId(null);
      return;
    }
    setOpenResultsId(expId);
    if (!results[expId]) {
      try {
        const res = await api.get(`/project/${id}/experiments/${expId}/results`);
        setResults((prev) => ({ ...prev, [expId]: res.data.variants }));
      } catch {
        toast.error("Failed to load results");
      }
    }
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="text-indigo-500" size={24} />
            A/B Experiments
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Split traffic between variants, persistently per visitor — no app code required if a
            variant just serves a different path.
          </p>
        </div>
      </div>

      <Card className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Plus size={16} className="text-indigo-500" />
          New Experiment
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Experiment key</label>
              <Input placeholder="homepage-hero" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="font-mono" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Goal path (optional)</label>
              <Input placeholder="/thank-you" value={newGoalPath} onChange={(e) => setNewGoalPath(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Variant A key</label>
              <Input value={variantA} onChange={(e) => setVariantA(e.target.value)} className="font-mono" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Variant B key</label>
              <Input value={variantB} onChange={(e) => setVariantB(e.target.value)} className="font-mono" required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Variant B path override (optional)</label>
              <Input placeholder="/index-b.html — leave blank if your app reads the X-Deployr-Experiment-* header instead" value={pathOverrideB} onChange={(e) => setPathOverrideB(e.target.value)} className="font-mono text-sm" />
            </div>
          </div>
          <p className="text-xs text-zinc-500">50/50 split by default — traffic is assigned once per visitor via cookie and stays consistent.</p>
          <Button type="submit" disabled={creating} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {creating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} className="mr-2" />}
            {creating ? "Creating…" : "Create Experiment"}
          </Button>
        </form>
      </Card>

      <div>
        <h2 className="text-base font-semibold mb-4">Experiments</h2>
        {loading ? (
          <div className="p-10 text-center text-zinc-500">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : experiments.length === 0 ? (
          <Card className="p-14 text-center border-dashed">
            <FlaskConical size={36} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-500">No experiments yet</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {experiments.map((exp) => (
              <Card key={exp.id} className="p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="font-mono text-sm font-semibold flex-1 min-w-[140px]">{exp.key}</code>
                  <span className="text-xs text-zinc-400">
                    {exp.variants.map((v) => v.key).join(" vs ")}
                    {exp.goalPath ? ` · goal: ${exp.goalPath}` : ""}
                  </span>
                  <Button variant={exp.enabled ? "default" : "outline"} size="sm" onClick={() => toggleEnabled(exp)}>
                    {exp.enabled ? "Running" : "Paused"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleResults(exp.id)} className="gap-1.5">
                    <BarChart3 size={13} /> Results
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(exp.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 size={15} />
                  </Button>
                </div>

                {openResultsId === exp.id && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    {!results[exp.id] ? (
                      <Loader2 size={16} className="animate-spin text-zinc-400" />
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-xs text-zinc-400">
                            <th className="py-1">Variant</th>
                            <th className="py-1">Exposures</th>
                            <th className="py-1">Conversions</th>
                            <th className="py-1">Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results[exp.id].map((r) => (
                            <tr key={r.key}>
                              <td className="py-1 font-mono">{r.key}</td>
                              <td className="py-1">{r.exposures}</td>
                              <td className="py-1">{r.conversions}</td>
                              <td className="py-1">{r.conversionRate != null ? `${r.conversionRate}%` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
