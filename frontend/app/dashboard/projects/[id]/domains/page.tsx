"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Globe, CheckCircle, Loader2, AlertTriangle, Shield, ExternalLink } from "lucide-react";

type Status = "idle" | "added" | "verified" | "error";

export default function DomainsPage() {
  const { id } = useParams();

  const [domain, setDomain] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  async function addDomain() {
    setError("");
    setLoading(true);

    try {
      const res = await api.post(`/project/${id}/domain`, { domain });
      setToken(res.data.verificationToken);
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
      await api.post(`/project/${id}/domain/verify`);
      setStatus("verified");
    } catch (err) {
      console.error(err);
      setError("Verification failed. DNS record not found yet.");
      setStatus("error");
    } finally {
      setVerifying(false);
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
              <h3 className="text-sm font-medium text-green-600">Domain verified — two more steps to go live:</h3>

              {/* Step A: CNAME */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Step 1 — Route traffic</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Add a CNAME record in your DNS provider pointing your domain to our edge:
                </p>
                <div className="bg-black text-green-400 rounded-lg p-4 text-sm overflow-x-auto">
                  <pre className="whitespace-pre-wrap">{`CNAME   ${domain}   edge.deployr.com`}</pre>
                </div>
              </div>

              {/* Step B: SSL via Cloudflare */}
              <div className="space-y-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex items-center gap-2 text-blue-400 text-sm font-semibold">
                  <Shield size={14} />
                  Step 2 — Enable HTTPS (free via Cloudflare)
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  To get HTTPS on your custom domain, proxy it through Cloudflare (free plan):
                </p>
                <ol className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5 list-decimal list-inside">
                  <li>Add your domain to Cloudflare and update your registrar nameservers</li>
                  <li>In Cloudflare DNS, add the CNAME above with the proxy enabled (orange cloud)</li>
                  <li>Under SSL/TLS, set mode to <strong className="text-zinc-300">Full</strong></li>
                </ol>
                <a
                  href="https://developers.cloudflare.com/fundamentals/get-started/setup/add-site/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1 transition-colors"
                >
                  Cloudflare setup guide <ExternalLink size={11} />
                </a>
              </div>
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
