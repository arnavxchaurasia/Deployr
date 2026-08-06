"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitBranch, CheckCircle2, Trash2, Loader2, Key, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// Unwrap axios response so callers work with plain data objects
const call = {
  get:    (url: string)                      => api.get(url).then(r => r.data),
  post:   (url: string, body: unknown)       => api.post(url, body).then(r => r.data),
  delete: (url: string)                      => api.delete(url).then(r => r.data),
};

interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
  updated_at: string;
}

export default function GitHubSettingsPage() {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectedLogin, setConnectedLogin] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const [appStatus, setAppStatus] = useState<{ available: boolean; installed: boolean; installUrl: string | null } | null>(null);

  // Check if a token is already saved by trying to list repos
  useEffect(() => {
    checkConnection();
    call.get("/github/app/status").then(setAppStatus).catch(() => {});
  }, []);

  async function checkConnection() {
    setLoadingRepos(true);
    try {
      const data = await call.get("/github/repos");
      if (data.repos) {
        setConnected(true);
        setRepos(data.repos);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoadingRepos(false);
    }
  }

  async function handleSave() {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const data = await call.post("/github/token", { token: token.trim() });
      setConnected(true);
      setConnectedLogin(data.login);
      setToken("");
      toast.success(`Connected as @${data.login}`);
      await checkConnection();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid token";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await call.delete("/github/token");
      setConnected(false);
      setConnectedLogin(null);
      setRepos([]);
      toast.success("GitHub token removed");
    } catch {
      toast.error("Failed to remove token");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">GitHub Integration</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Connect a GitHub Personal Access Token to browse repositories, enable PR preview comments,
          and auto-detect framework settings.
        </p>
      </div>

      {/* GitHub App card — preferred over a PAT when the operator has one configured */}
      {appStatus?.available && (
        <Card className="p-6 space-y-4 border-indigo-500/20 bg-indigo-500/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center">
              <GitBranch size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">GitHub App (recommended)</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Fine-grained repo access, org-wide install, and no personal token to keep alive.
              </p>
            </div>
            {appStatus.installed && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">
                <CheckCircle2 size={11} />
                Installed
              </span>
            )}
          </div>
          {!appStatus.installed && appStatus.installUrl && (
            <a href={appStatus.installUrl} target="_blank" rel="noreferrer">
              <Button className="gap-2">
                <GitBranch size={13} />
                Connect via GitHub App
              </Button>
            </a>
          )}
        </Card>
      )}

      {/* Connection card */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <GitBranch size={18} className="text-zinc-700 dark:text-zinc-300" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Personal Access Token</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Requires <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">repo</code> scope.
              {" "}<a
                href="https://github.com/settings/tokens/new?scopes=repo&description=Deployr"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-500 hover:underline"
              >
                Generate one on GitHub →
              </a>
            </p>
          </div>
          {connected && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={11} />
              Connected{connectedLogin ? ` · @${connectedLogin}` : ""}
            </span>
          )}
        </div>

        {connected ? (
          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={checkConnection}
              disabled={loadingRepos}
              className="gap-2"
            >
              {loadingRepos ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh repos
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={removing}
              className="gap-2"
            >
              {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Remove token
            </Button>
          </div>
        ) : (
          <div className="flex gap-3 pt-1">
            <Input
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="font-mono text-sm"
            />
            <Button onClick={handleSave} disabled={saving || !token.trim()} className="gap-2 shrink-0">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
              Connect
            </Button>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800">
          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
          <span>Your token is encrypted at rest and never exposed in logs or API responses.</span>
        </div>
      </Card>

      {/* Repos list */}
      {connected && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <p className="text-sm font-medium">
              {loadingRepos ? "Loading repositories…" : `${repos.length} repositories accessible`}
            </p>
          </div>

          {loadingRepos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          ) : repos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <GitBranch size={28} className="mb-3 opacity-40" />
              <p className="text-sm">No repositories found</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-80 overflow-y-auto">
              {repos.map(repo => (
                <li key={repo.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{repo.full_name}</p>
                    {repo.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{repo.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {repo.private && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500">
                        Private
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-400 font-mono">{repo.default_branch}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* What this enables */}
      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-4">
          What this enables
        </p>
        <ul className="space-y-3">
          {[
            { icon: "🔍", title: "Repository browser", desc: "Pick a repo from a list when creating a new project instead of pasting a URL." },
            { icon: "🤖", title: "Framework auto-detection", desc: "Deployr reads your package.json and pre-fills the build command, output directory, and install command." },
            { icon: "💬", title: "PR preview comments", desc: "When a preview deployment is ready, Deployr posts a comment on the pull request with the preview URL." },
          ].map(f => (
            <li key={f.title} className="flex gap-3 text-sm">
              <span className="text-base leading-none mt-0.5">{f.icon}</span>
              <div>
                <span className="font-medium">{f.title}</span>
                <span className="text-zinc-500 dark:text-zinc-400"> — {f.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}