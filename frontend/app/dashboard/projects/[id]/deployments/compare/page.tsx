"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, GitBranch, Loader2, RotateCcw } from "lucide-react";

type Summary = {
  id: string;
  status: string;
  branch: string | null;
  commitHash: string | null;
  trigger: string;
  createdAt: string;
  finishedAt: string | null;
  isActive: boolean;
  isPreview: boolean;
};

type EnvVar = { key: string; environment: string; value: string };

type CompareResponse = {
  a: Summary;
  b: Summary;
  currentEnvVars?: EnvVar[];
};

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  const differs = a !== b;
  return (
    <div className="grid grid-cols-[120px_1fr_1fr] gap-4 py-2.5 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={differs ? "font-medium text-amber-600 dark:text-amber-400" : ""}>{a || "—"}</span>
      <span className={differs ? "font-medium text-amber-600 dark:text-amber-400" : ""}>{b || "—"}</span>
    </div>
  );
}

export default function CompareDeploymentsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    if (!a || !b) return;
    api.get(`/deployments/compare?a=${a}&b=${b}`)
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load comparison"))
      .finally(() => setLoading(false));
  }, [a, b]);

  async function promoteTo(deploymentId: string) {
    setPromoting(true);
    try {
      await api.post(`/deployments/${deploymentId}/promote`);
      router.push(`/dashboard/projects/${projectId}/deployments`);
    } catch {
      setError("Failed to promote deployment");
    } finally {
      setPromoting(false);
    }
  }

  if (!a || !b) {
    return <p className="text-sm text-zinc-500 p-6">Missing deployments to compare.</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-red-500 p-6">{error || "Something went wrong."}</p>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
        <button
          onClick={() => router.push(`/dashboard/projects/${projectId}/deployments`)}
          className="hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Deployments
        </button>
        <span>/</span>
        <span className="text-zinc-650 dark:text-zinc-200">Compare</span>
      </div>

      <h1 className="text-2xl font-bold flex items-center gap-2">
        <GitBranch size={20} />
        Compare deployments
      </h1>

      <Card className="p-6">
        <div className="grid grid-cols-[120px_1fr_1fr] gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-700 mb-1">
          <span />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {data.a.id.slice(0, 8)} {data.a.isActive && "(current)"}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {data.b.id.slice(0, 8)} {data.b.isActive && "(current)"}
          </span>
        </div>

        <Row label="Status" a={data.a.status} b={data.b.status} />
        <Row label="Branch" a={data.a.branch ?? ""} b={data.b.branch ?? ""} />
        <Row label="Commit" a={data.a.commitHash?.slice(0, 8) ?? ""} b={data.b.commitHash?.slice(0, 8) ?? ""} />
        <Row label="Trigger" a={data.a.trigger} b={data.b.trigger} />
        <Row label="Created" a={new Date(data.a.createdAt).toLocaleString()} b={new Date(data.b.createdAt).toLocaleString()} />

        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          {!data.a.isActive && (
            <Button size="sm" variant="outline" onClick={() => promoteTo(data.a.id)} disabled={promoting}>
              <RotateCcw size={13} className="mr-1.5" /> Promote {data.a.id.slice(0, 8)}
            </Button>
          )}
          {!data.b.isActive && (
            <Button size="sm" variant="outline" onClick={() => promoteTo(data.b.id)} disabled={promoting}>
              <RotateCcw size={13} className="mr-1.5" /> Promote {data.b.id.slice(0, 8)}
            </Button>
          )}
        </div>
      </Card>

      {data.currentEnvVars && (
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-1">Current environment variables</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Env vars aren't versioned per deployment — this is the project's current config, not a
            historical snapshot from when either deployment was built.
          </p>
          <div className="space-y-1.5">
            {data.currentEnvVars.map((v) => (
              <div key={`${v.key}-${v.environment}`} className="flex items-center gap-3 text-xs font-mono">
                <span className="text-zinc-400 w-20 shrink-0">{v.environment}</span>
                <span className="font-semibold">{v.key}</span>
                <span className="text-zinc-500 truncate">= {v.value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
