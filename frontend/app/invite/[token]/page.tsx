"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Users, Loader2, CheckCircle2, XCircle, LogIn } from "lucide-react";
import Link from "next/link";

const call = {
  get:  (url: string)              => api.get(url).then(r => r.data),
  post: (url: string, b: unknown)  => api.post(url, b).then(r => r.data),
};

interface InviteInfo {
  org: { name: string };
  email: string;
  role: string;
  expiresAt: string;
  expired?: boolean;
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [invite, setInvite]     = useState<InviteInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    call.get(`/invitations/${token}`)
      .then(data => setInvite(data as InviteInfo))
      .catch(() => setError("This invitation link is invalid or has already been used."))
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    setAccepting(true);
    try {
      await call.post(`/invitations/${token}/accept`, {});
      setDone(true);
      setTimeout(() => router.push(`/dashboard`), 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="text-xl font-bold tracking-tight">Deployr</Link>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 space-y-5 shadow-sm">

          {done ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <p className="font-semibold">You're in!</p>
              <p className="text-sm text-zinc-500">Redirecting to your dashboard…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <XCircle size={40} className="text-red-400" />
              <p className="font-semibold">Invalid invitation</p>
              <p className="text-sm text-zinc-500">{error}</p>
              <Link href="/dashboard">
                <Button variant="outline" size="sm">Go to dashboard</Button>
              </Link>
            </div>
          ) : invite?.expired ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <XCircle size={40} className="text-amber-400" />
              <p className="font-semibold">Invitation expired</p>
              <p className="text-sm text-zinc-500">Ask your team admin to send a new invite.</p>
            </div>
          ) : invite ? (
            <>
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg mb-1">
                  {invite.org.name[0].toUpperCase()}
                </div>
                <p className="font-semibold">{invite.org.name}</p>
                <p className="text-sm text-zinc-500">
                  You've been invited to join as <strong>{invite.role.toLowerCase()}</strong>.
                </p>
              </div>

              {status === "unauthenticated" ? (
                <div className="space-y-3">
                  <p className="text-sm text-center text-zinc-500">
                    Sign in to accept this invitation.
                  </p>
                  <Link href={`/auth?callbackUrl=/invite/${token}`} className="block">
                    <Button className="w-full gap-2">
                      <LogIn size={14} />
                      Sign in to accept
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-center text-zinc-400">
                    Accepting as <strong>{session?.user?.email}</strong>
                  </p>
                  <Button onClick={accept} disabled={accepting} className="w-full gap-2">
                    {accepting
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Users size={14} />
                    }
                    Accept invitation
                  </Button>
                  <Link href="/dashboard" className="block">
                    <Button variant="ghost" className="w-full text-zinc-500">Decline</Button>
                  </Link>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}