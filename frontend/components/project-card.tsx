"use client";

import Link from "next/link";
import { ExternalLink, GitBranch } from "lucide-react";
import { Card } from "@/components/ui/card";

type Props = {
  id: string;
  name: string;
  repo?: string;
  status: string;
  liveUrl: string | null;
};

function statusStyles(status: string) {
  switch (status) {
    case "READY":
      return "bg-emerald-500/10 text-emerald-600";
    case "BUILDING":
      return "bg-blue-500/10 text-blue-600";
    case "FAILED":
      return "bg-red-500/10 text-red-600";
    case "QUEUED":
      return "bg-yellow-500/10 text-yellow-600";
    default:
      return "bg-zinc-500/10 text-zinc-600";
  }
}

export function ProjectCard({ id, name, repo, status, liveUrl }: Props) {
  return (
    <Link href={`/project/${id}`}>
      <Card className="group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
        
        {/* gradient glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition pointer-events-none bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5" />

        <div className="relative space-y-4">
          {/* Header */}
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-lg">{name}</h3>
            <span
              className={`text-xs px-2 py-1 rounded-full ${statusStyles(status)}`}
            >
              {status}
            </span>
          </div>

          {/* Repo */}
          {repo && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <GitBranch size={14} />
              <span className="truncate">{repo}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-zinc-400">
              View project →
            </span>

            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-xs flex items-center gap-1 text-blue-600 hover:underline"
              >
                Live
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
