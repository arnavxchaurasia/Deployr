"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Zap, Shield, FlaskConical, BarChart3, Users, Puzzle,
  GitBranch, Globe, RefreshCw, Terminal, Flag, Beaker,
  GitMerge, Lock, Bell, CreditCard, Activity, Search,
  ArrowRight, CheckCircle2, ChevronRight, Code2, Layers,
  Cpu, Database, Eye, Settings2, FileText, Repeat2,
  Map, Radio, Gauge, Package, ScanLine, TrendingUp,
  Webhook, MonitorCheck, Wallet, UserCheck, Building2,
  BookOpen, LayoutGrid, Clock, Archive, Network,
} from "lucide-react";

/* ─── animation helpers ─────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.1 },
  transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] },
});

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, amount: 0.1 },
  transition: { duration: 0.5, delay },
});

/* ─── Terminal Demo ─────────────────────────────────────────── */
const LINES = [
  { t: 0,    text: "$ git push origin main",            cl: "text-zinc-300" },
  { t: 400,  text: "→ Detected: Next.js 15",             cl: "text-indigo-400" },
  { t: 700,  text: "→ Installing dependencies…",         cl: "text-zinc-400" },
  { t: 1100, text: "→ Running build…",                   cl: "text-zinc-400" },
  { t: 1600, text: "✓ Build successful (21s)",            cl: "text-emerald-400" },
  { t: 2000, text: "→ Deploying to edge (12 regions)…",  cl: "text-zinc-400" },
  { t: 2600, text: "✓ Live: https://myapp.deployr.app",   cl: "text-emerald-400 font-semibold" },
  { t: 3000, text: "→ Preview URL ready for PR #47",     cl: "text-sky-400" },
];

function TerminalDemo() {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-zinc-400 font-mono">deployr · terminal</span>
      </div>
      <div className="p-5 font-mono text-sm space-y-1.5 min-h-[220px] bg-zinc-950">
        {LINES.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: l.t / 1000, duration: 0.3 }}
            className={l.cl}
          >
            {l.text}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Feature Pillars ───────────────────────────────────────── */
const PILLARS = [
  {
    icon: Zap,
    title: "Instant Deployments",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    desc: "Push to any branch and get a live deployment in seconds. Streaming build logs, atomic rollbacks, and per-branch preview URLs included.",
    tags: ["Push-to-deploy", "Preview URLs", "Rollbacks", "Staging envs", "Approval gates"],
  },
  {
    icon: Shield,
    title: "Edge Security",
    color: "text-red-500",
    bg: "bg-red-500/10",
    desc: "Enterprise-grade protection at the edge — WAF rules, rate limiting, geo-blocking, bot protection, and CDN image resizing, all without extra config.",
    tags: ["Edge WAF", "Rate limiting", "Geo routing", "Bot protection", "CDN / Brotli"],
  },
  {
    icon: FlaskConical,
    title: "Experimentation",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    desc: "Ship with confidence. Feature flags, true A/B split testing, and staged rollouts let your team experiment without touching the deploy pipeline.",
    tags: ["Feature flags", "A/B testing", "Staged rollouts", "Remote config", "CLI tunnel"],
  },
  {
    icon: BarChart3,
    title: "Observability",
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    desc: "Full-stack visibility from build to runtime. OpenTelemetry distributed traces, structured log search, uptime monitoring, and cost forecasting.",
    tags: ["Distributed tracing", "Log search", "Uptime monitoring", "Build perf regression", "Cost alerts"],
  },
  {
    icon: Users,
    title: "Team & Enterprise",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    desc: "Everything large teams need — SAML/SSO, granular per-project permissions, deployment approval gates, audit logs, and weekly digest emails.",
    tags: ["SAML / SSO", "Org permissions", "Audit logs", "Budget alerts", "Weekly digests"],
  },
  {
    icon: Puzzle,
    title: "Integrations",
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    desc: "Connect the tools your team already uses. GitHub, GitLab, Bitbucket, Slack, and an open integrations marketplace for custom webhooks.",
    tags: ["GitHub", "GitLab", "Bitbucket", "Slack", "Webhooks marketplace"],
  },
];

/* ─── All features tile list ────────────────────────────────── */
const ALL_FEATURES = [
  { icon: GitBranch,    label: "Preview URL per branch" },
  { icon: RefreshCw,    label: "One-click rollbacks" },
  { icon: GitMerge,     label: "Deployment approvals" },
  { icon: Layers,       label: "Staging environments" },
  { icon: Globe,        label: "12-region edge CDN" },
  { icon: Shield,       label: "Edge WAF rules" },
  { icon: Gauge,        label: "Rate limiting" },
  { icon: Map,          label: "Geo routing & blocking" },
  { icon: Radio,        label: "WebSocket proxying" },
  { icon: Archive,      label: "Brotli compression" },
  { icon: Flag,         label: "Feature flags" },
  { icon: Beaker,       label: "True A/B testing" },
  { icon: Terminal,     label: "CLI local dev tunnel" },
  { icon: Settings2,    label: "Shared env var groups" },
  { icon: LayoutGrid,   label: "Project templates" },
  { icon: Network,      label: "OpenTelemetry tracing" },
  { icon: Search,       label: "Structured log search" },
  { icon: MonitorCheck, label: "Uptime monitoring" },
  { icon: ScanLine,     label: "Vuln scanning" },
  { icon: TrendingUp,   label: "Build perf regression" },
  { icon: Lock,         label: "SAML / SSO" },
  { icon: UserCheck,    label: "Per-project permissions" },
  { icon: FileText,     label: "Audit log export" },
  { icon: Wallet,       label: "Budget alerts" },
  { icon: Bell,         label: "Weekly team digest" },
  { icon: CreditCard,   label: "Invoice history & PDFs" },
  { icon: Database,     label: "Managed storage addons" },
  { icon: Webhook,      label: "Integrations marketplace" },
  { icon: Clock,        label: "Cron job runner" },
  { icon: Package,      label: "Cost forecasting" },
];

/* ─── How it works ──────────────────────────────────────────── */
const STEPS = [
  {
    n: "01",
    title: "Connect your repo",
    desc: "Link GitHub, GitLab, or Bitbucket in one click. Every push triggers an automatic build.",
    icon: GitBranch,
  },
  {
    n: "02",
    title: "We build & deploy",
    desc: "Deployr detects your framework, runs your build, and ships to 12 edge regions — no config required.",
    icon: Zap,
  },
  {
    n: "03",
    title: "Ship with confidence",
    desc: "Preview URLs for every PR. Instant rollbacks. Feature flags and A/B tests built-in.",
    icon: CheckCircle2,
  },
];

/* ─── Integrations ──────────────────────────────────────────── */
const INTEGRATIONS = [
  { label: "GitHub",    abbr: "GH", bg: "bg-zinc-900",   fg: "text-white" },
  { label: "GitLab",    abbr: "GL", bg: "bg-orange-500", fg: "text-white" },
  { label: "Bitbucket", abbr: "BB", bg: "bg-blue-600",   fg: "text-white" },
  { label: "Slack",     abbr: "SL", bg: "bg-purple-600", fg: "text-white" },
  { label: "Next.js",   abbr: "NX", bg: "bg-black",      fg: "text-white" },
  { label: "Node.js",   abbr: "ND", bg: "bg-green-600",  fg: "text-white" },
  { label: "Python",    abbr: "PY", bg: "bg-yellow-500", fg: "text-white" },
  { label: "Docker",    abbr: "DK", bg: "bg-sky-600",    fg: "text-white" },
];

/* ─── Page ──────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">

      {/* ── HERO ── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-500/10 dark:bg-indigo-500/5 blur-3xl" />
          <div className="absolute top-60 -left-40 w-[500px] h-[500px] rounded-full bg-purple-500/10 dark:bg-purple-500/5 blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div {...fadeUp(0)} className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono font-medium border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Now live · 30 features · zero-config deploys
            </motion.div>

            <motion.h1 {...fadeUp(0.05)} className="text-5xl lg:text-[3.5rem] font-bold leading-[1.1] tracking-tight mb-6">
              Deploy faster.<br />
              <span className="text-indigo-600 dark:text-indigo-400">Ship with confidence.</span>
            </motion.h1>

            <motion.p {...fadeUp(0.1)} className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-lg mb-10">
              Deployr is a full-stack platform engineering cloud. Push to GitHub and get a live deployment in seconds — with edge CDN, feature flags, A/B testing, distributed tracing, and enterprise security included.
            </motion.p>

            <motion.div {...fadeUp(0.15)} className="flex flex-wrap gap-3">
              <Link
                href="/auth"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-500/25"
              >
                Start deploying free
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/#features"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium text-sm transition"
              >
                See all features
                <ChevronRight size={16} />
              </Link>
            </motion.div>

            <motion.div {...fadeUp(0.2)} className="flex flex-wrap items-center gap-6 mt-10 text-sm text-zinc-500 dark:text-zinc-400">
              {["Free plan available", "No credit card required", "Any framework"].map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          <motion.div {...fadeUp(0.1)}>
            <TerminalDemo />
          </motion.div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="border-y border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { val: "21s",    label: "Median deploy time" },
            { val: "99.99%", label: "Platform uptime" },
            { val: "12",     label: "Edge regions" },
            { val: "30+",    label: "Built-in features" },
          ].map((s, i) => (
            <motion.div key={s.label} {...fadeIn(i * 0.05)} className="text-center">
              <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{s.val}</div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FEATURE PILLARS ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp()} className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-500 mb-3">Platform capabilities</p>
            <h2 className="text-4xl font-bold tracking-tight mb-4">Everything in one platform</h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              No stitching together five tools. Deployr ships deployments, security, experimentation, observability, and enterprise controls as one coherent system.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PILLARS.map((p, i) => (
              <motion.div
                key={p.title}
                {...fadeUp(i * 0.07)}
                className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-lg hover:shadow-indigo-500/5 transition-all"
              >
                <div className={`w-11 h-11 rounded-xl ${p.bg} flex items-center justify-center mb-4`}>
                  <p.icon size={22} className={p.color} />
                </div>
                <h3 className="text-lg font-semibold mb-2">{p.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">{p.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.tags.map(tag => (
                    <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ALL FEATURES GRID ── */}
      <section className="py-20 px-6 bg-zinc-50 dark:bg-zinc-900/40">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp()} className="text-center max-w-xl mx-auto mb-12">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-500 mb-3">Full feature list</p>
            <h2 className="text-3xl font-bold tracking-tight">30 features. Zero compromise.</h2>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {ALL_FEATURES.map((f, i) => (
              <motion.div
                key={f.label}
                {...fadeIn(i * 0.02)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              >
                <f.icon size={15} className="text-indigo-500 shrink-0" />
                <span className="text-zinc-700 dark:text-zinc-300 text-xs leading-tight">{f.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp()} className="text-center max-w-xl mx-auto mb-16">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-500 mb-3">How it works</p>
            <h2 className="text-4xl font-bold tracking-tight">Deploy in 3 steps</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <motion.div key={s.n} {...fadeUp(i * 0.1)} className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center mx-auto mb-5">
                  <s.icon size={28} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="text-xs font-mono text-zinc-400 mb-2">{s.n}</div>
                <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE CALLOUT: Experimentation ── */}
      <section className="py-20 px-6 bg-zinc-50 dark:bg-zinc-900/40">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp()}>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-lg">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-3 text-xs text-zinc-400 font-mono">feature-flag example</span>
              </div>
              <pre className="p-5 text-sm font-mono overflow-x-auto text-zinc-300 leading-relaxed bg-zinc-950">{`// Check a feature flag at runtime
const { enabled } = await deployr.flags.get(
  'new-checkout-flow',
  { userId: user.id }
);

if (enabled) {
  return <NewCheckout />;
}

// A/B test variant assignment
const variant = await deployr.experiments
  .assign('homepage-cta', user.id);
// variant: 'control' | 'variant-a' | 'variant-b'`}</pre>
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.1)}>
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-500 mb-3">Experimentation platform</p>
            <h2 className="text-3xl font-bold tracking-tight mb-4">Ship features without risk</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
              Feature flags and true A/B testing are built into the deployment pipeline — not bolted on. Roll out to 1% of users, measure impact, and promote or kill without a new deploy.
            </p>
            <ul className="space-y-3">
              {[
                "Remote config updates with zero redeploy",
                "Percentage-based user targeting",
                "Per-project or global flag scopes",
                "Staging environments for safe QA",
              ].map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURE CALLOUT: Observability ── */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp()}>
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-500 mb-3">Observability</p>
            <h2 className="text-3xl font-bold tracking-tight mb-4">Full-stack visibility, zero setup</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
              OpenTelemetry distributed traces flow from your edge function all the way to your database. Structured log search, uptime monitoring, build regression detection, and cost forecasting all ship on day one.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Network,      label: "Distributed traces (OTEL)" },
                { icon: Search,       label: "Structured log search" },
                { icon: MonitorCheck, label: "Uptime monitoring" },
                { icon: TrendingUp,   label: "Build perf regression" },
                { icon: ScanLine,     label: "Vulnerability scanning" },
                { icon: Package,      label: "Cost forecasting" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <item.icon size={15} className="text-sky-500 shrink-0" />
                  {item.label}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.1)} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-lg">
            <div className="text-xs font-mono text-zinc-400 mb-4">Trace: POST /api/checkout · 94ms</div>
            {[
              { label: "edge:middleware",   ms: 4,  pct: 4,  color: "bg-sky-400" },
              { label: "api:route-handler", ms: 12, pct: 13, color: "bg-indigo-400" },
              { label: "db:query(users)",   ms: 18, pct: 19, color: "bg-purple-400" },
              { label: "db:query(cart)",    ms: 23, pct: 24, color: "bg-purple-400" },
              { label: "payment:stripe",    ms: 31, pct: 33, color: "bg-emerald-400" },
              { label: "cache:set",         ms: 6,  pct: 6,  color: "bg-amber-400" },
            ].map((span, i) => (
              <div key={span.label} className="flex items-center gap-3 mb-2.5">
                <div className="w-40 shrink-0 text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate">{span.label}</div>
                <div className="flex-1 h-5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${span.pct}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.6, ease: "easeOut" }}
                    className={`h-full ${span.color} rounded`}
                  />
                </div>
                <div className="w-12 text-right text-xs font-mono text-zinc-400">{span.ms}ms</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── INTEGRATIONS ── */}
      <section className="py-20 px-6 bg-zinc-50 dark:bg-zinc-900/40">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp()} className="text-center max-w-xl mx-auto mb-12">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-500 mb-3">Integrations</p>
            <h2 className="text-3xl font-bold tracking-tight mb-3">Works with your stack</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              Connect your existing Git provider in one click. Any framework, any language.
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-4">
            {INTEGRATIONS.map((int, i) => (
              <motion.div
                key={int.label}
                {...fadeIn(i * 0.05)}
                className="flex items-center gap-3 px-5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              >
                <div className={`w-8 h-8 rounded-lg ${int.bg} ${int.fg} flex items-center justify-center text-xs font-bold`}>
                  {int.abbr}
                </div>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{int.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING CALLOUT ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeUp()} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 md:p-14 text-center shadow-xl">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-500 mb-3">Pricing</p>
            <h2 className="text-4xl font-bold tracking-tight mb-4">Start free, scale when you&apos;re ready</h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto mb-8">
              Hobby plan is free forever. Pro unlocks unlimited projects, team members, and advanced features like SAML SSO and custom domains.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/auth"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-500/25"
              >
                Get started free
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium text-sm transition"
              >
                Compare plans
                <ChevronRight size={16} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 px-6 bg-indigo-600 dark:bg-indigo-700">
        <motion.div {...fadeUp()} className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
            Your next deploy is one push away.
          </h2>
          <p className="text-indigo-200 text-lg mb-10 max-w-xl mx-auto">
            Join teams who ship faster with Deployr — from a solo side project to a multi-region enterprise deployment.
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-indigo-600 font-semibold hover:bg-indigo-50 transition text-base shadow-xl"
          >
            Deploy for free
            <ArrowRight size={18} />
          </Link>
        </motion.div>
      </section>

    </div>
  );
}
