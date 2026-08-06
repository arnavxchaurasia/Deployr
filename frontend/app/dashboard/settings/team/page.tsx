"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const call = {
  get:    (url: string)                => api.get(url).then(r => r.data),
  post:   (url: string, b: unknown)   => api.post(url, b).then(r => r.data),
  delete: (url: string)               => api.delete(url).then(r => r.data),
  patch:  (url: string, b: unknown)   => api.patch(url, b).then(r => r.data),
};
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users, Plus, Loader2, Trash2, Crown, Shield,
  UserCheck, Mail, ChevronDown, Building2, CreditCard, CheckCircle2, FileText, Webhook,
} from "lucide-react";
import { toast } from "sonner";

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load payment SDK"));
    document.body.appendChild(script);
  });
}

type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  memberCount: number;
}

interface Member {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: OrgRole;
  joinedAt: string;
}

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  members: Member[];
}

const ROLE_LABELS: Record<OrgRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };
const ROLE_ICON: Record<OrgRole, React.ReactNode> = {
  OWNER:  <Crown  size={12} className="text-amber-500" />,
  ADMIN:  <Shield size={12} className="text-indigo-500" />,
  MEMBER: <UserCheck size={12} className="text-zinc-500" />,
};

export default function TeamSettingsPage() {
  const [orgs, setOrgs]               = useState<Org[]>([]);
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [newOrgName, setNewOrgName]   = useState("");
  const [showCreate, setShowCreate]   = useState(false);
  const [selected, setSelected]       = useState<OrgDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [inviting, setInviting]       = useState(false);

  // Billing state
  const [billing, setBilling] = useState<{
    plan: "FREE" | "PRO" | "ENTERPRISE";
    memberCount: number;
    seatsPurchased: number;
    seatsExceeded: boolean;
    pricePerSeat: number;
    freeTierMemberLimit: number;
  } | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  async function fetchBilling(orgId: string) {
    try {
      const data = await call.get(`/orgs/${orgId}/billing`);
      setBilling(data);
    } catch {
      setBilling(null);
    }
  }

  const [auditExportUrl, setAuditExportUrl] = useState("");
  const [auditExportEnabled, setAuditExportEnabled] = useState(false);
  const [savingAuditExport, setSavingAuditExport] = useState(false);

  async function fetchAuditExport(orgId: string) {
    try {
      const data = await call.get(`/orgs/${orgId}/audit-export`);
      setAuditExportEnabled(data.enabled);
      setAuditExportUrl(data.webhookUrl || "");
    } catch {
      setAuditExportEnabled(false);
    }
  }

  async function saveAuditExport() {
    if (!selected) return;
    setSavingAuditExport(true);
    try {
      await call.post(`/orgs/${selected.id}/audit-export`, { webhookUrl: auditExportUrl.trim() });
      setAuditExportEnabled(true);
      toast.success("Audit log export enabled");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save audit export webhook");
    } finally {
      setSavingAuditExport(false);
    }
  }

  async function disableAuditExport() {
    if (!selected) return;
    setSavingAuditExport(true);
    try {
      await call.delete(`/orgs/${selected.id}/audit-export`);
      setAuditExportEnabled(false);
      setAuditExportUrl("");
      toast.success("Audit log export disabled");
    } catch {
      toast.error("Failed to disable audit export");
    } finally {
      setSavingAuditExport(false);
    }
  }

  const [orgWebhookUrl, setOrgWebhookUrl] = useState("");
  const [orgWebhookEnabled, setOrgWebhookEnabled] = useState(false);
  const [savingOrgWebhook, setSavingOrgWebhook] = useState(false);

  async function fetchOrgWebhook(orgId: string) {
    try {
      const data = await call.get(`/orgs/${orgId}/webhook`);
      setOrgWebhookEnabled(data.enabled);
      setOrgWebhookUrl(data.webhookUrl || "");
    } catch {
      setOrgWebhookEnabled(false);
    }
  }

  async function saveOrgWebhook() {
    if (!selected) return;
    setSavingOrgWebhook(true);
    try {
      await call.post(`/orgs/${selected.id}/webhook`, { webhookUrl: orgWebhookUrl.trim() });
      setOrgWebhookEnabled(true);
      toast.success("Team webhook enabled");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save team webhook");
    } finally {
      setSavingOrgWebhook(false);
    }
  }

  async function disableOrgWebhook() {
    if (!selected) return;
    setSavingOrgWebhook(true);
    try {
      await call.delete(`/orgs/${selected.id}/webhook`);
      setOrgWebhookEnabled(false);
      setOrgWebhookUrl("");
      toast.success("Team webhook disabled");
    } catch {
      toast.error("Failed to disable team webhook");
    } finally {
      setSavingOrgWebhook(false);
    }
  }

  async function upgradeTeam() {
    if (!selected) return;
    setUpgrading(true);
    try {
      await loadRazorpayScript();
      const order = await call.post(`/orgs/${selected.id}/billing/create-order`, {});

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount.toString(),
        currency: "INR",
        name: "Deployr Team",
        description: `${order.seats} seat${order.seats !== 1 ? "s" : ""} · Team plan`,
        order_id: order.orderId,
        handler: async (response: any) => {
          try {
            await call.post(`/orgs/${selected.id}/billing/verify`, {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success("Team upgraded to Pro");
            fetchBilling(selected.id);
          } catch {
            toast.error("Payment verification failed");
          }
        },
        theme: { color: "#4f46e5" },
      });
      rzp.open();
    } catch {
      toast.error("Failed to start checkout");
    } finally {
      setUpgrading(false);
    }
  }

  useEffect(() => { fetchOrgs(); }, []);

  async function fetchOrgs() {
    setLoading(true);
    try {
      const data = await call.get("/orgs");
      setOrgs(data.orgs ?? []);
    } catch {
      toast.error("Failed to load teams");
    } finally {
      setLoading(false);
    }
  }

  async function createOrg() {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      await call.post("/orgs", { name: newOrgName.trim() });
      setNewOrgName("");
      setShowCreate(false);
      toast.success("Team created");
      await fetchOrgs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setCreating(false);
    }
  }

  async function selectOrg(org: Org) {
    setLoadingDetail(true);
    setSelected(null);
    setBilling(null);
    try {
      const data = await call.get(`/orgs/${org.id}`);
      setSelected(data as OrgDetail);
      fetchBilling(org.id);
      fetchAuditExport(org.id);
      fetchOrgWebhook(org.id);
    } catch {
      toast.error("Failed to load team details");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function sendInvite() {
    if (!selected || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await call.post(`/orgs/${selected.id}/invite`, { email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail("");
      toast.success(`Invite sent to ${inviteEmail}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(userId: string) {
    if (!selected) return;
    try {
      await call.delete(`/orgs/${selected.id}/members/${userId}`);
      setSelected(prev => prev
        ? { ...prev, members: prev.members.filter(m => m.id !== userId) }
        : null
      );
      toast.success("Member removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  async function changeRole(userId: string, role: OrgRole) {
    if (!selected) return;
    try {
      await call.patch(`/orgs/${selected.id}/members/${userId}`, { role });
      setSelected(prev => prev
        ? { ...prev, members: prev.members.map(m => m.id === userId ? { ...m, role } : m) }
        : null
      );
      toast.success("Role updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  const canManage = orgs.find(o => o.id === selected?.id)?.role !== "MEMBER";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Teams</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Collaborate with others by creating a team and inviting members.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowCreate(v => !v)}>
          <Plus size={14} />
          New team
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="p-5">
          <p className="text-sm font-medium mb-3">Create a team</p>
          <div className="flex gap-3">
            <Input
              placeholder="Team name"
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createOrg()}
            />
            <Button onClick={createOrg} disabled={creating || !newOrgName.trim()} className="gap-2 shrink-0">
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Building2 size={13} />}
              Create
            </Button>
          </div>
        </Card>
      )}

      {/* Org list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-zinc-400" />
        </div>
      ) : orgs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
          <Users size={32} className="opacity-40" />
          <p className="text-sm">No teams yet</p>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} className="gap-2">
            <Plus size={13} />
            Create your first team
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {orgs.map(org => (
            <Card
              key={org.id}
              className={`p-4 cursor-pointer transition hover:border-zinc-300 dark:hover:border-zinc-600 ${selected?.id === org.id ? "border-indigo-400 dark:border-indigo-500" : ""}`}
              onClick={() => selectOrg(org)}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                  {org.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{org.name}</p>
                  <p className="text-xs text-zinc-500">@{org.slug} · {org.memberCount} member{org.memberCount !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {ROLE_ICON[org.role]}
                  {ROLE_LABELS[org.role]}
                </div>
                <ChevronDown size={14} className={`text-zinc-400 transition-transform ${selected?.id === org.id ? "rotate-180" : ""}`} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Org detail panel */}
      {loadingDetail && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={18} className="animate-spin text-zinc-400" />
        </div>
      )}

      {selected && !loadingDetail && billing && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-indigo-500" />
              <p className="text-sm font-medium">
                {billing.plan === "FREE" ? "Free plan" : `${billing.plan} plan`} · {billing.memberCount} member{billing.memberCount !== 1 ? "s" : ""}
              </p>
            </div>
            {billing.plan !== "FREE" && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={12} /> {billing.seatsPurchased} seat{billing.seatsPurchased !== 1 ? "s" : ""} purchased
              </span>
            )}
          </div>

          {billing.plan === "FREE" && (
            <p className="text-xs text-zinc-500">
              Free teams are limited to {billing.freeTierMemberLimit} members. Upgrade for ₹{billing.pricePerSeat}/seat/month, unlimited members, and higher build quota.
            </p>
          )}
          {billing.seatsExceeded && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Your team has grown to {billing.memberCount} members but only {billing.seatsPurchased} seats are paid for — buy more seats to stay covered.
            </p>
          )}

          {canManage && (billing.plan === "FREE" || billing.seatsExceeded) && (
            <Button size="sm" onClick={upgradeTeam} disabled={upgrading} className="gap-2">
              {upgrading ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
              {billing.plan === "FREE" ? "Upgrade team" : `Buy ${billing.memberCount} seats`}
            </Button>
          )}
        </Card>
      )}

      {selected && !loadingDetail && canManage && (
        <Card className="p-5 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText size={16} className="text-indigo-500" />
              <p className="text-sm font-medium">Audit log export</p>
              {auditExportEnabled && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> Enabled
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              POST every audit event for this team's projects to your SIEM/webhook endpoint as it happens.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={auditExportUrl}
              onChange={e => setAuditExportUrl(e.target.value)}
              placeholder="https://your-siem.example.com/ingest"
              className="text-sm font-mono"
            />
            <Button size="sm" onClick={saveAuditExport} disabled={savingAuditExport || !auditExportUrl.trim()} className="shrink-0">
              {savingAuditExport ? <Loader2 size={13} className="animate-spin" /> : "Save"}
            </Button>
            {auditExportEnabled && (
              <Button size="sm" variant="ghost" onClick={disableAuditExport} disabled={savingAuditExport} className="shrink-0 text-red-500 hover:text-red-600">
                Disable
              </Button>
            )}
          </div>
        </Card>
      )}

      {selected && !loadingDetail && canManage && (
        <Card className="p-5 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Webhook size={16} className="text-indigo-500" />
              <p className="text-sm font-medium">Team webhook</p>
              {orgWebhookEnabled && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> Enabled
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              POST here on team-level events — a member joins or leaves, a project is transferred
              into or out of this team, or the plan changes. Distinct from a project's deployment
              notification webhook.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={orgWebhookUrl}
              onChange={e => setOrgWebhookUrl(e.target.value)}
              placeholder="https://your-endpoint.example.com/webhook"
              className="text-sm font-mono"
            />
            <Button size="sm" onClick={saveOrgWebhook} disabled={savingOrgWebhook || !orgWebhookUrl.trim()} className="shrink-0">
              {savingOrgWebhook ? <Loader2 size={13} className="animate-spin" /> : "Save"}
            </Button>
            {orgWebhookEnabled && (
              <Button size="sm" variant="ghost" onClick={disableOrgWebhook} disabled={savingOrgWebhook} className="shrink-0 text-red-500 hover:text-red-600">
                Disable
              </Button>
            )}
          </div>
        </Card>
      )}

      {selected && !loadingDetail && (
        <Card className="overflow-hidden">
          {/* Members */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-sm font-medium">Members · {selected.members.length}</p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {selected.members.map(member => (
              <li key={member.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                  {member.image
                    ? <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                    : member.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{member.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && member.role !== "OWNER" ? (
                    <select
                      value={member.role}
                      onChange={e => changeRole(member.id, e.target.value as OrgRole)}
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 bg-transparent text-zinc-700 dark:text-zinc-300"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                      {ROLE_ICON[member.role]}
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                  {canManage && member.role !== "OWNER" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-zinc-400 hover:text-red-500"
                      onClick={() => removeMember(member.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Invite */}
          {canManage && (
            <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Invite by email</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendInvite()}
                  className="text-sm"
                />
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as "MEMBER" | "ADMIN")}
                  className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 bg-transparent text-zinc-700 dark:text-zinc-300 shrink-0"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <Button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()} className="gap-2 shrink-0">
                  {inviting ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                  Invite
                </Button>
              </div>
              <p className="text-xs text-zinc-400">
                They'll receive an email with a link to join <strong>{selected.name}</strong>.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}