"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Blocks, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";

type ConnectorField = { key: string; label: string; type: string };
type Connector = {
  id: string;
  name: string;
  description: string;
  fields: ConnectorField[];
  config: (Record<string, string> & { enabled?: boolean }) | null;
};

export default function IntegrationsMarketplacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/integrations`);
      const list: Connector[] = res.data;
      setConnectors(list);
      const nextDrafts: Record<string, Record<string, string>> = {};
      for (const c of list) {
        nextDrafts[c.id] = {};
        for (const f of c.fields) nextDrafts[c.id][f.key] = c.config?.[f.key] ?? "";
      }
      setDrafts(nextDrafts);
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  async function saveConnector(connector: Connector, enabled: boolean) {
    setSavingId(connector.id);
    try {
      await api.post(`/project/${id}/integrations/${connector.id}`, {
        enabled,
        ...drafts[connector.id],
      });
      toast.success(enabled ? `${connector.name} enabled` : `${connector.name} disabled`);
      await fetchConnectors();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || `Failed to save ${connector.name}`);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Blocks className="text-indigo-500" size={24} />
            Integrations Marketplace
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Connect third-party tools — enabling one injects its config as build-time env vars automatically.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-zinc-500">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {connectors.map((connector) => {
            const enabled = !!connector.config?.enabled;
            return (
              <Card key={connector.id} className="p-6 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      {connector.name}
                      {enabled && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={11} /> Enabled
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-zinc-500 mt-1">{connector.description}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {connector.fields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{f.label}</label>
                      <Input
                        type={f.type === "password" ? "password" : "text"}
                        value={drafts[connector.id]?.[f.key] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [connector.id]: { ...d[connector.id], [f.key]: e.target.value } }))
                        }
                        className="font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => saveConnector(connector, true)}
                    disabled={savingId === connector.id}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {savingId === connector.id ? "Saving…" : enabled ? "Update" : "Enable"}
                  </Button>
                  {enabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => saveConnector(connector, false)}
                      disabled={savingId === connector.id}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      Disable
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
