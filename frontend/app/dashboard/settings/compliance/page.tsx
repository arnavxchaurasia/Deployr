"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, CheckCircle2, XCircle, Users, FileText, Loader2, ChevronDown } from "lucide-react";

type Org = { id: string; name: string; role: string };

type Member = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
  lastLoginAt: string | null;
};

type ComplianceOverview = {
  ssoEnabled: boolean;
  auditExportEnabled: boolean;
  auditLogRetentionDays: number | null;
  auditLogCount: number;
  members: Member[];
};

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function CompliancePage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [overview, setOverview] = useState<ComplianceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [retentionDays, setRetentionDays] = useState("");
  const [savingRetention, setSavingRetention] = useState(false);

  useEffect(() => {
    api.get("/orgs").then((res) => {
      const list: Org[] = res.data.orgs ?? [];
      setOrgs(list);
      if (list.length) setSelectedOrgId(list[0].id);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchOverview = useCallback(async (orgId: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/orgs/${orgId}/compliance`);
      setOverview(res.data);
      setRetentionDays(res.data.auditLogRetentionDays != null ? String(res.data.auditLogRetentionDays) : "");
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedOrgId) fetchOverview(selectedOrgId); }, [selectedOrgId, fetchOverview]);

  async function saveRetention() {
    if (!selectedOrgId) return;
    setSavingRetention(true);
    try {
      const value = retentionDays.trim() ? parseInt(retentionDays.trim(), 10) : null;
      await api.post(`/orgs/${selectedOrgId}/compliance`, { auditLogRetentionDays: value });
      toast.success(value ? `Audit logs now retained for ${value} days` : "Audit log retention disabled — logs kept forever");
      fetchOverview(selectedOrgId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save retention policy");
    } finally {
      setSavingRetention(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8 pb-20 animate-fadeIn">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <ShieldCheck size={20} className="text-indigo-500" /> Compliance Center
        </h2>
        <p className="text-zinc-500 mt-1 text-sm">
          SSO, audit log retention, and member access review — the checklist an enterprise buyer's
          security team usually asks for.
        </p>
      </div>

      {orgs.length > 1 && (
        <div className="relative inline-block">
          <select
            value={selectedOrgId ?? ""}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md pl-3 pr-8 py-2 bg-transparent appearance-none"
          >
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-zinc-500">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : !overview ? (
        <Card className="p-10 text-center text-sm text-zinc-500">No team selected, or you don't have access.</Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="p-5">
              <p className="text-xs text-zinc-500 mb-1">SAML SSO</p>
              <p className={`text-sm font-semibold flex items-center gap-1.5 ${overview.ssoEnabled ? "text-emerald-600" : "text-zinc-400"}`}>
                {overview.ssoEnabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {overview.ssoEnabled ? "Enabled" : "Not configured"}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs text-zinc-500 mb-1">Audit Export</p>
              <p className={`text-sm font-semibold flex items-center gap-1.5 ${overview.auditExportEnabled ? "text-emerald-600" : "text-zinc-400"}`}>
                {overview.auditExportEnabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {overview.auditExportEnabled ? "Enabled" : "Not configured"}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs text-zinc-500 mb-1">Audit Log Entries</p>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <FileText size={14} className="text-indigo-500" />
                {overview.auditLogCount.toLocaleString()}
              </p>
            </Card>
          </div>

          <Card className="p-6 space-y-3">
            <h2 className="text-base font-semibold">Audit Log Retention</h2>
            <p className="text-xs text-zinc-500">
              How long to keep project-scoped audit log entries before purging them. Leave blank to
              keep forever. Org-level events (member joined/left, etc.) aren't covered by this
              policy today.
            </p>
            <div className="flex gap-3">
              <Input
                type="number"
                min={1}
                max={3650}
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                placeholder="e.g. 365 (keep forever)"
                className="font-mono text-sm max-w-[200px]"
              />
              <Button onClick={saveRetention} disabled={savingRetention} variant="outline">
                {savingRetention ? "Saving…" : "Save"}
              </Button>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Users size={16} className="text-indigo-500" />
              Access Review
            </h2>
            <div className="space-y-2">
              {overview.members.map((m) => {
                const idle = daysSince(m.lastLoginAt);
                return (
                  <div key={m.id} className="flex items-center justify-between text-sm border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{m.name || m.email}</p>
                      <p className="text-xs text-zinc-400">{m.email} · {m.role}</p>
                    </div>
                    <p className={`text-xs ${idle != null && idle > 90 ? "text-amber-600" : "text-zinc-400"}`}>
                      {idle == null ? "Never logged in" : idle === 0 ? "Active today" : `Last active ${idle}d ago`}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
