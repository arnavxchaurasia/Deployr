"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Globe, CheckCircle, Loader2, AlertTriangle } from "lucide-react";

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
            <div className="mt-4 pt-4 border-t border-dashed">
              <h3 className="text-sm font-medium text-green-600 mb-2">🎉 Success! Next steps:</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                Your domain is verified. To route traffic to your project, add the following CNAME record to your DNS provider:
              </p>
              <div className="bg-black text-green-400 rounded-lg p-4 text-sm overflow-x-auto">
                <pre className="whitespace-pre-wrap">
{`CNAME   ${domain}   edge.deployr.com`}
                </pre>
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
