"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Globe2, CheckCircle2, AlertTriangle, ExternalLink, ArrowRight } from "lucide-react";

type DomainEntry = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  domain: string;
  verified: boolean;
  verificationToken: string | null;
};

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const res = await api.get("/domains");
      setDomains(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Custom Domains</h1>
        <p className="text-zinc-500 mt-1 text-sm">
          All custom domains across your projects. Manage DNS verification per project.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <Card className="p-16 text-center border-dashed rounded-2xl">
          <Globe2 size={40} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">No custom domains yet</p>
          <p className="text-sm text-zinc-500 mt-1">
            Open a project and go to <strong>Domains</strong> to add one.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {domains.map(entry => (
            <Link
              key={entry.domain}
              href={`/dashboard/projects/${entry.projectId}/domains`}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-white/10 hover:border-indigo-500/40 transition-all group"
            >
              {entry.verified
                ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                : <AlertTriangle size={18} className="text-amber-500 shrink-0" />}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 font-mono">
                    {entry.domain}
                  </span>
                  <a
                    href={`https://${entry.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-zinc-400 hover:text-indigo-500 transition-colors"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {entry.projectName} ·{" "}
                  {entry.verified
                    ? <span className="text-emerald-500">Verified</span>
                    : <span className="text-amber-500">Pending DNS verification</span>}
                </p>
              </div>

              <ArrowRight size={16} className="text-zinc-300 group-hover:text-indigo-400 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}