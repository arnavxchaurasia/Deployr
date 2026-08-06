"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Globe, CheckCircle, Loader2, AlertTriangle, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Status = "idle" | "added" | "verified" | "error";
type SslStatus = "none" | "pending" | "pending_validation" | "pending_issuance" | "active" | "error" | string;

export default function DomainsPage() {
  const { id } = useParams();

  const [domain, setDomain] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [cnameTarget, setCnameTarget] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [sslStatus, setSslStatus] = useState<SslStatus>("none");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const [purgePaths, setPurgePaths] = useState("/");
  const [purging, setPurging] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startSslPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/project/${id}/domain/status`);
        setSslStatus(res.data.sslStatus);
        if (res.data.sslStatus === "active" || res.data.sslStatus === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // non-fatal — keep polling
      }
    }, 5000);
  }

  async function addDomain() {
    setError("");
    setLoading(true);

    try {
      const res = await api.post(`/project/${id}/domain`, { domain });
      setToken(res.data.verificationToken);
      setCnameTarget(res.data.cnameTarget);
      setStatus("added");
    } catch (err) {
      console.error(err);
      setError("Failed to add domain. Please try again.");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  async function verifyDomain() {
    setError("");
    setVerifying(true);

    try {
      const res = await api.post(`/project/${id}/domain/verify`);
      setStatus("verified");
      setSslStatus(res.data.sslStatus ?? "none");
      if (res.data.sslStatus && res.data.sslStatus !== "active" && res.data.sslStatus !== "error") {
        startSslPolling();
      }
    } catch (err) {
      console.error(err);
      setError("Verification failed. DNS record not found yet.");
      setStatus("error");
    } finally {
      setVerifying(false);
    }
  }

  async function purgeCache() {
    setPurging(true);
    try {
      const paths = purgePaths.split(",").map(p => p.trim()).filter(Boolean);
      await api.post(`/project/${id}/cache/purge`, { paths: paths.length ? paths : ["/"] });
      toast.success("Cache purged");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to purge cache");
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold flex items-center gap-2">
          <Globe size={24} />
          Custom Domain
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Connect your own domain to this project
        </p>
      </div>

      {/* Step 1: Add domain */}
      <Card className="p-6 rounded-2xl space-y-4">
        <div>
          <label className="text-sm font-medium">Domain name</label>
          <input
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="example.com"
            className="mt-2 w-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
          />
        </div>

        <Button
          onClick={addDomain}
          disabled={loading || !domain}
          className="rounded-xl"
        >
          {loading ? "Adding domain…" : "Add domain"}
        </Button>

        {error && status === "error" && (
          <p className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle size={14} />
            {error}
          </p>
        )}
      </Card>

      {/* Step 2: Verify */}
      {status !== "idle" && token && (
        <Card className="p-6 rounded-2xl space-y-5 border-dashed">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">Verify domain ownership</h2>
            <p className="text-sm text-zinc-500">
              Add the following TXT record to your DNS provider
            </p>
          </div>

          <div className="bg-black text-green-400 rounded-lg p-4 text-sm overflow-x-auto">
            <pre className="whitespace-pre-wrap">
{`_deployr.${domain} = ${token}`}
            </pre>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={verifyDomain}
              disabled={verifying || status === "verified"}
              className="rounded-xl"
            >
              {verifying ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Verifying…
                </>
              ) : (
                "Verify domain"
              )}
            </Button>

            {status === "verified" && (
              <span className="text-green-600 flex items-center gap-2 text-sm font-medium">
                <CheckCircle size={16} />
                Domain verified
              </span>
            )}
          </div>

          {status === "verified" && (
            <div className="mt-4 pt-4 border-t border-dashed space-y-4">
              <h3 className="text-sm font-medium text-green-600">Domain verified — one more step to go live:</h3>

              {/* Step A: CNAME */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Step 1 — Route traffic</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Add a CNAME record in your DNS provider pointing your domain to our edge:
                </p>
                <div className="bg-black text-green-400 rounded-lg p-4 text-sm overflow-x-auto">
                  <pre className="whitespace-pre-wrap">{`CNAME   ${domain}   ${cnameTarget ?? "edge.deployr.com"}`}</pre>
                </div>
              </div>

              {/* Step B: SSL — automatic once the CNAME above is live */}
              <div className="space-y-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex items-center gap-2 text-blue-400 text-sm font-semibold">
                  <Shield size={14} />
                  Step 2 — HTTPS certificate
                </div>
                {sslStatus === "active" ? (
                  <p className="text-sm text-green-600 flex items-center gap-2">
                    <CheckCircle size={14} />
                    Certificate active — HTTPS is live on {domain}
                  </p>
                ) : sslStatus === "error" ? (
                  <p className="text-sm text-red-500 flex items-center gap-2">
                    <AlertTriangle size={14} />
                    Certificate issuance failed. Double-check the CNAME above, then re-verify.
                  </p>
                ) : (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    We're automatically issuing a certificate ({sslStatus}) — this can take a few minutes
                    once the CNAME above resolves. No action needed.
                  </p>
                )}
              </div>

              {/* Step C: Purge edge cache on demand */}
              {sslStatus === "active" && (
                <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <RefreshCw size={14} />
                    Purge edge cache
                  </div>
                  <p className="text-sm text-zinc-500">
                    Invalidate cached paths immediately instead of waiting on TTL. Comma-separated.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={purgePaths}
                      onChange={e => setPurgePaths(e.target.value)}
                      placeholder="/, /about"
                      className="flex-1 text-sm font-mono border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
                    />
                    <Button type="button" onClick={purgeCache} disabled={purging} variant="outline" className="shrink-0">
                      {purging ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <RefreshCw size={14} className="mr-1.5" />}
                      Purge
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && status === "error" && (
            <p className="text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle size={14} />
              {error}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
