"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, FolderGit2, GitCommit, FileText, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

type SearchResults = {
  projects: { id: string; name: string; slug: string }[];
  deployments: { id: string; projectId: string; projectName?: string; branch: string | null; status: string }[];
  logs: { deploymentId: string; projectId?: string; projectName?: string; log: string }[];
};

export function GlobalSearch() {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/search?q=${encodeURIComponent(q)}`);
      setResults(res.data);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  function go(path: string) {
    setOpen(false);
    setQuery("");
    setResults(null);
    router.push(path);
  }

  if (!session) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 border border-zinc-200 dark:border-zinc-800 transition-colors"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <Search size={16} className="text-zinc-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, deployments, logs..."
                className="flex-1 bg-transparent outline-none text-sm"
              />
              {loading && <Loader2 size={14} className="animate-spin text-zinc-400" />}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {!results && query.trim().length >= 2 && !loading && (
                <p className="text-sm text-zinc-400 text-center py-8">No results</p>
              )}
              {!results && query.trim().length < 2 && (
                <p className="text-sm text-zinc-400 text-center py-8">Type at least 2 characters</p>
              )}

              {results && results.projects.length > 0 && (
                <div className="py-2">
                  <p className="px-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Projects</p>
                  {results.projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => go(`/dashboard/projects/${p.id}`)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-white/5 text-left"
                    >
                      <FolderGit2 size={14} className="text-indigo-500 shrink-0" />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              {results && results.deployments.length > 0 && (
                <div className="py-2 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="px-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Deployments</p>
                  {results.deployments.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => go(`/dashboard/projects/${d.projectId}/deployments`)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-white/5 text-left"
                    >
                      <GitCommit size={14} className="text-blue-500 shrink-0" />
                      <span className="truncate">{d.projectName} — {d.branch ?? d.id.slice(0, 8)}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.logs.length > 0 && (
                <div className="py-2 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="px-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Logs</p>
                  {results.logs.map((l, i) => (
                    <button
                      key={i}
                      onClick={() => go(`/dashboard/logs/${l.deploymentId}`)}
                      className="w-full flex items-start gap-2 px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-white/5 text-left"
                    >
                      <FileText size={14} className="text-zinc-400 shrink-0 mt-0.5" />
                      <span className="truncate text-xs font-mono text-zinc-500">{l.log}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
