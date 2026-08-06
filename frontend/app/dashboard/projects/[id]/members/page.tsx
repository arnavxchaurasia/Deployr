"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Users, ArrowLeft, Loader2, Crown, ShieldCheck } from "lucide-react";

type Role = "MEMBER" | "ADMIN" | "OWNER";

type Member = {
  userId: string;
  name: string | null;
  email: string;
  orgRole: Role;
  override: Role | null;
  effectiveRole: Role;
  isCreator: boolean;
};

const ROLES: Role[] = ["MEMBER", "ADMIN", "OWNER"];

export default function ProjectMembersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [orgOwned, setOrgOwned] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/members`);
      setMembers(res.data.members);
      setOrgOwned(res.data.orgOwned);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load project members");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function setOverride(member: Member, role: Role | "org-default") {
    setSavingUserId(member.userId);
    try {
      if (role === "org-default") {
        await api.delete(`/project/${id}/members/${member.userId}/override`);
        toast.success(`${member.email} now uses their org role (${member.orgRole})`);
      } else {
        await api.post(`/project/${id}/members/${member.userId}/override`, { role });
        toast.success(`${member.email} set to ${role} on this project`);
      }
      await fetchMembers();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update access");
    } finally {
      setSavingUserId(null);
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
            <Users className="text-indigo-500" size={24} />
            Project Access
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Override a team member&apos;s org-wide role for just this project — grant elevated access,
            or restrict it, without changing what they can do anywhere else.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-zinc-500">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : !orgOwned ? (
        <Card className="p-10 text-center">
          <ShieldCheck size={32} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-semibold text-zinc-500">This project isn&apos;t owned by a team</p>
          <p className="text-xs text-zinc-400 mt-1">Per-project overrides only apply to team-owned projects.</p>
        </Card>
      ) : members.length === 0 ? (
        <Card className="p-10 text-center text-zinc-500 text-sm">No other team members yet.</Card>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <Card key={m.userId} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  {m.name || m.email}
                  {m.isCreator && <Crown size={12} className="text-amber-500" />}
                </p>
                <p className="text-xs text-zinc-400">{m.email}</p>
              </div>
              <span className="text-xs text-zinc-500">Org role: <span className="font-mono">{m.orgRole}</span></span>
              {m.isCreator ? (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Always OWNER (creator)</span>
              ) : (
                <select
                  value={m.override ?? "org-default"}
                  onChange={(e) => setOverride(m, e.target.value as Role | "org-default")}
                  disabled={savingUserId === m.userId}
                  className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1.5 bg-transparent shrink-0"
                >
                  <option value="org-default">Use org role ({m.orgRole})</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>Override: {r}</option>
                  ))}
                </select>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
