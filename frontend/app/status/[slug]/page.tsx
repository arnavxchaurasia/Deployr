"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface UptimeCheck {
  up: boolean;
  latencyMs: number | null;
  checkedAt: string;
}

interface ActiveDeployment {
  status: string;
  createdAt: string;
  branch: string | null;
}

interface StatusData {
  name: string;
  slug: string;
  uptimePct: number | null;
  avgLatency: number | null;
  currentStatus: "operational" | "degraded";
  activeDeployment: ActiveDeployment | null;
  checks: UptimeCheck[];
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

function UptimeBar({ checks }: { checks: UptimeCheck[] }) {
  if (checks.length === 0) {
    return (
      <div className="uptime-bar-empty">
        No uptime data available yet.
      </div>
    );
  }

  return (
    <div className="uptime-bar-wrapper">
      <div className="uptime-bar-track">
        {checks.map((c, i) => (
          <div
            key={i}
            className={`uptime-bar-segment ${c.up ? "up" : "down"}`}
            title={`${new Date(c.checkedAt).toLocaleString()} — ${c.up ? "Up" : "Down"}${c.latencyMs != null ? ` — ${c.latencyMs}ms` : ""}`}
          />
        ))}
      </div>
      <div className="uptime-bar-labels">
        <span>Older</span>
        <span>Now</span>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!subscribeEmail.trim()) return;
    setSubscribing(true);
    setSubscribeError(null);
    try {
      const res = await fetch(`${API}/status/${slug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subscribeEmail.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to subscribe");
      }
      setSubscribed(true);
    } catch (err) {
      setSubscribeError(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setSubscribing(false);
    }
  }

  useEffect(() => {
    if (!slug) return;

    fetch(`${API}/status/${slug}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load status");
        }
        return res.json() as Promise<StatusData>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #ffffff;
          --surface: #f9fafb;
          --border: #e5e7eb;
          --text-primary: #111827;
          --text-secondary: #6b7280;
          --text-muted: #9ca3af;
          --green: #16a34a;
          --green-light: #dcfce7;
          --green-dot: #22c55e;
          --red: #dc2626;
          --red-light: #fee2e2;
          --red-dot: #ef4444;
          --accent: #2563eb;
          --radius: 10px;
          --bar-up: #22c55e;
          --bar-down: #ef4444;
        }

        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #0f1117;
            --surface: #1a1d27;
            --border: #2d3148;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --text-muted: #6b7280;
            --green: #4ade80;
            --green-light: #052e16;
            --green-dot: #4ade80;
            --red: #f87171;
            --red-light: #1f0a0a;
            --red-dot: #f87171;
            --accent: #60a5fa;
            --bar-up: #4ade80;
            --bar-down: #f87171;
          }
        }

        body {
          background: var(--bg);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          min-height: 100vh;
        }

        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 48px 20px 80px;
        }

        .container {
          width: 100%;
          max-width: 680px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ── Status hero ── */
        .hero {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .hero-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .project-name {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.3px;
          color: var(--text-primary);
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.2px;
        }

        .status-badge.operational {
          background: var(--green-light);
          color: var(--green);
        }

        .status-badge.degraded {
          background: var(--red-light);
          color: var(--red);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .operational .status-dot {
          background: var(--green-dot);
          box-shadow: 0 0 0 2px var(--green-light);
          animation: pulse-green 2s ease-in-out infinite;
        }

        .degraded .status-dot {
          background: var(--red-dot);
          box-shadow: 0 0 0 2px var(--red-light);
          animation: pulse-red 1.4s ease-in-out infinite;
        }

        @keyframes pulse-green {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes pulse-red {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .status-headline {
          font-size: 16px;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        /* ── Stats row ── */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }

        .stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .stat-value {
          font-size: 26px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.5px;
          line-height: 1.2;
        }

        .stat-unit {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        /* ── Uptime chart card ── */
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 22px 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .card-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .uptime-bar-wrapper {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .uptime-bar-track {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 36px;
          overflow: hidden;
        }

        .uptime-bar-segment {
          flex: 1;
          min-width: 3px;
          max-width: 10px;
          height: 100%;
          border-radius: 2px;
          flex-shrink: 0;
          transition: opacity 0.15s;
        }

        .uptime-bar-segment:hover {
          opacity: 0.75;
        }

        .uptime-bar-segment.up {
          background: var(--bar-up);
        }

        .uptime-bar-segment.down {
          background: var(--bar-down);
        }

        .uptime-bar-labels {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-muted);
        }

        .uptime-bar-empty {
          font-size: 13px;
          color: var(--text-muted);
          padding: 12px 0;
        }

        /* ── Deployment info ── */
        .deploy-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }

        .deploy-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .deploy-label {
          font-size: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.6px;
          font-weight: 500;
        }

        .deploy-value {
          font-size: 14px;
          color: var(--text-primary);
          font-weight: 500;
        }

        .deploy-branch {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-secondary);
          background: var(--border);
          border-radius: 4px;
          padding: 2px 8px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
        }

        /* ── Loading / error states ── */
        .center-state {
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--text-secondary);
        }

        .spinner {
          width: 28px;
          height: 28px;
          border: 2.5px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-icon {
          font-size: 32px;
        }

        .error-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .error-msg {
          font-size: 14px;
          color: var(--text-muted);
        }

        /* ── Footer ── */
        .footer {
          margin-top: auto;
          padding-top: 40px;
          text-align: center;
          font-size: 13px;
          color: var(--text-muted);
        }

        .footer a {
          color: var(--accent);
          text-decoration: none;
          font-weight: 500;
        }

        .footer a:hover {
          text-decoration: underline;
        }

        .divider {
          height: 1px;
          background: var(--border);
          border: none;
        }

        /* ── Subscribe form ── */
        .subscribe-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .subscribe-input {
          flex: 1;
          min-width: 160px;
          padding: 9px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text-primary);
          font-size: 14px;
        }

        .subscribe-button {
          padding: 9px 16px;
          border-radius: 8px;
          border: none;
          background: var(--accent);
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .subscribe-button:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .subscribe-msg {
          font-size: 13px;
          color: var(--text-muted);
        }

        .subscribe-msg.error {
          color: var(--red);
        }
      `}</style>

      <div className="page">
        {loading && (
          <div className="center-state">
            <div className="spinner" />
            <span>Loading status…</span>
          </div>
        )}

        {!loading && error && (
          <div className="center-state">
            <div className="error-icon">⚠</div>
            <div className="error-title">Page not found</div>
            <div className="error-msg">{error}</div>
          </div>
        )}

        {!loading && data && (
          <div className="container">
            {/* Hero */}
            <div className="hero">
              <div className="hero-top">
                <span className="project-name">{data.name}</span>
                <span className={`status-badge ${data.currentStatus}`}>
                  <span className="status-dot" />
                  {data.currentStatus === "operational"
                    ? "All Systems Operational"
                    : "Service Degraded"}
                </span>
              </div>
              <div className="status-headline">
                {data.currentStatus === "operational"
                  ? "Everything is running smoothly."
                  : "We are experiencing issues. Our team is working on a fix."}
              </div>
            </div>

            {/* Stats */}
            <div className="stats-row">
              <div className="stat-card">
                <span className="stat-label">Uptime</span>
                <span className="stat-value">
                  {data.uptimePct != null ? (
                    <>
                      {data.uptimePct.toFixed(1)}
                      <span className="stat-unit">%</span>
                    </>
                  ) : (
                    <span className="stat-unit">—</span>
                  )}
                </span>
                <span className="stat-label" style={{ marginTop: 2 }}>Last 90 checks</span>
              </div>

              <div className="stat-card">
                <span className="stat-label">Avg Response</span>
                <span className="stat-value">
                  {data.avgLatency != null ? (
                    <>
                      {data.avgLatency}
                      <span className="stat-unit">ms</span>
                    </>
                  ) : (
                    <span className="stat-unit">—</span>
                  )}
                </span>
                <span className="stat-label" style={{ marginTop: 2 }}>Mean latency</span>
              </div>

              {data.activeDeployment && (
                <div className="stat-card">
                  <span className="stat-label">Last Deploy</span>
                  <span className="stat-value" style={{ fontSize: 17 }}>
                    {formatRelativeTime(data.activeDeployment.createdAt)}
                  </span>
                  {data.activeDeployment.branch && (
                    <span className="deploy-branch">
                      ⎇ {data.activeDeployment.branch}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Uptime chart */}
            <div className="card">
              <div className="card-title">Uptime history — last 60 checks</div>
              <UptimeBar checks={data.checks} />
            </div>

            {/* Incident subscription */}
            <div className="card">
              <div className="card-title">Get notified</div>
              {subscribed ? (
                <div className="subscribe-msg">You&apos;re subscribed — we&apos;ll email you if this goes down.</div>
              ) : (
                <form onSubmit={handleSubscribe} className="subscribe-row">
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={subscribeEmail}
                    onChange={(e) => setSubscribeEmail(e.target.value)}
                    className="subscribe-input"
                  />
                  <button type="submit" disabled={subscribing || !subscribeEmail.trim()} className="subscribe-button">
                    {subscribing ? "Subscribing…" : "Subscribe"}
                  </button>
                </form>
              )}
              {subscribeError && <div className="subscribe-msg error">{subscribeError}</div>}
              {!subscribed && !subscribeError && (
                <div className="subscribe-msg">Email alerts when this service goes down.</div>
              )}
            </div>

            {/* Footer */}
            <div className="footer">
              Powered by{" "}
              <a href="/" rel="noopener noreferrer">
                Deployr
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
