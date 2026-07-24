"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import {
  ChevronRight, Globe2, GitBranch, CheckCircle2, Plus, Minus,
  ArrowRight, Lock, RefreshCw, Activity, Webhook,
  Terminal, ExternalLink, Shield,
} from "lucide-react";

// ─── Terminal Demo ────────────────────────────────────────────────────────────

const TERMINAL_LINES = [
  { text: "$ git push origin main", cls: "text-zinc-100" },
  { text: "Enumerating objects: 23, done.", cls: "text-zinc-500 text-xs" },
  { text: "Writing objects: 100% | 4.21 KiB", cls: "text-zinc-500 text-xs" },
  { text: "", cls: "" },
  { text: "→ Deployr   Build queued for main (a3f7c21)", cls: "text-indigo-300 text-xs" },
  { text: "", cls: "" },
  { text: "  ✓  Clone repository ................  0.4s", cls: "text-[#22d3a8]" },
  { text: "  ✓  npm ci .........................  11.2s", cls: "text-[#22d3a8]" },
  { text: "  ✓  npm run build ..................   6.8s", cls: "text-[#22d3a8]" },
  { text: "  ✓  Upload 1,847 files to S3 .......   1.1s", cls: "text-[#22d3a8]" },
  { text: "  ✓  Lambda@Edge provisioned ........   1.4s", cls: "text-[#22d3a8]" },
  { text: "  ✓  CDN invalidated ................   0.2s", cls: "text-[#22d3a8]" },
  { text: "", cls: "" },
  { text: "  Deployed in 21.1s", cls: "text-white font-semibold" },
  { text: "  ↗ https://my-app.deployr.app", cls: "text-sky-400" },
];

const LINE_DELAYS = [0, 350, 650, 950, 1500, 1800, 2800, 4300, 6000, 7400, 8900, 9200, 9500, 10300, 10800];

function TerminalDemo() {
  const [cycleKey, setCycleKey] = useState(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    const timers = LINE_DELAYS.map((delay, i) =>
      setTimeout(() => setShown(i + 1), delay + 600)
    );
    const loop = setTimeout(() => setCycleKey(k => k + 1), 17000);
    return () => { timers.forEach(clearTimeout); clearTimeout(loop); };
  }, [cycleKey]);

  return (
    <div className="rounded-2xl bg-[#07070d] border border-white/[0.07] overflow-hidden shadow-2xl shadow-black/50 font-mono text-sm select-none">
      <div className="flex items-center gap-1.5 px-4 py-3 bg-[#0d0d18] border-b border-white/[0.05]">
        <span className="w-3 h-3 rounded-full bg-red-500/60" />
        <span className="w-3 h-3 rounded-full bg-amber-500/60" />
        <span className="w-3 h-3 rounded-full bg-[#22d3a8]/60" />
        <span className="ml-3 text-[11px] text-zinc-600">zsh — my-app</span>
        <span className="ml-auto text-[11px] text-zinc-700 font-mono">⬡ deployr</span>
      </div>
      <div className="p-5 min-h-[320px] leading-[1.65]">
        {TERMINAL_LINES.slice(0, shown).map((line, i) => (
          <div key={i} className={`${line.cls} whitespace-pre`}>{line.text || " "}</div>
        ))}
        {shown < TERMINAL_LINES.length && (
          <span className="inline-block w-[7px] h-[1em] bg-indigo-400/70 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

// ─── SpotlightCard ────────────────────────────────────────────────────────────

function SpotlightCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      className={`relative rounded-2xl border border-zinc-200 dark:border-white/[0.07] bg-white dark:bg-[#0d0d18] overflow-hidden transition-colors ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 z-10"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(420px circle at ${pos.x}px ${pos.y}px, rgba(90,92,247,0.09), transparent 50%)`,
        }}
      />
      <div className="relative z-20">{children}</div>
    </div>
  );
}

// ─── Framework ticker ─────────────────────────────────────────────────────────

const FRAMEWORKS = [
  "Next.js", "React", "Vite", "Astro", "Remix", "SvelteKit",
  "Vue.js", "Nuxt", "TypeScript", "Node.js", "Bun", "Deno",
];

function FrameworkTicker() {
  const doubled = [...FRAMEWORKS, ...FRAMEWORKS];
  return (
    <div className="w-full overflow-hidden border-y border-zinc-100 dark:border-white/[0.05] bg-zinc-50 dark:bg-[#0a0a14] py-4 relative">
      <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-zinc-50 dark:from-[#0a0a14] to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-zinc-50 dark:from-[#0a0a14] to-transparent z-10 pointer-events-none" />
      <div className="flex w-[200%] animate-[ticker_40s_linear_infinite]">
        {doubled.map((name, i) => (
          <div key={i} className="flex-none px-6 flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-600 whitespace-nowrap">
            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:text-zinc-700" />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    icon: GitBranch,
    step: "01",
    title: "Connect your repo",
    desc: "Paste a GitHub URL. No OAuth app installation, no permissions dance. Deployr watches for pushes immediately.",
  },
  {
    icon: Terminal,
    step: "02",
    title: "Push to deploy",
    desc: "Your build command, your output directory, your Node version. Each build runs in an isolated ECS Fargate container.",
  },
  {
    icon: Globe2,
    step: "03",
    title: "Globally live",
    desc: "Assets land on S3, served via Lambda@Edge. A unique URL for every branch. Production URL for main.",
  },
];

// Product capabilities — factual, specific, no made-up numbers
const CAPABILITIES = [
  {
    icon: GitBranch,
    color: "text-violet-400",
    accent: "bg-violet-500/[0.08] border-violet-500/20",
    title: "A URL for every branch",
    desc: "Every pull request and non-main branch gets its own isolated deployment — separate S3 prefix, separate Lambda, separate env vars. Share with your team before merging.",
  },
  {
    icon: Globe2,
    color: "text-sky-400",
    accent: "bg-sky-500/[0.08] border-sky-500/20",
    title: "Edge delivery, not just a CDN rule",
    desc: "Your code runs at the network edge closest to each visitor via Lambda@Edge. Low latency isn't a config toggle — it's the default.",
  },
  {
    icon: Activity,
    color: "text-[#22d3a8]",
    accent: "bg-[#22d3a8]/[0.07] border-[#22d3a8]/20",
    title: "Build logs, streaming in real time",
    desc: "Watch each build step as it runs: install, build, upload, provision. No polling, no page refresh — output streams directly to your browser.",
  },
  {
    icon: Lock,
    color: "text-amber-400",
    accent: "bg-amber-500/[0.07] border-amber-500/20",
    title: "Encrypted environment variables",
    desc: "AES-256-GCM for every secret. Scope them to production, preview, or all deployments. Never stored in plaintext, never logged.",
  },
];

const SMALL_FEATURES = [
  { icon: RefreshCw, color: "text-indigo-400", title: "One-click rollbacks",   desc: "Promote any previous deployment to production instantly. Zero downtime." },
  { icon: Shield,    color: "text-violet-400", title: "Automatic SSL",         desc: "Custom domains with HTTPS provisioned automatically. No cert management." },
  { icon: Webhook,   color: "text-pink-400",   title: "Deploy webhooks",       desc: "POST to a token URL to trigger a deploy from any CI pipeline." },
  { icon: ExternalLink, color: "text-sky-400", title: "Custom domains",        desc: "Add your own domain in seconds. Verify, point DNS, done." },
];

const TESTIMONIALS = [
  {
    text: "We went from deploying once a week out of fear to merging freely. Preview URLs changed how our team works — no more 'is that on staging?' questions.",
    name: "Sarah K.",
    role: "Staff Engineer",
    initials: "SK",
    gradient: "from-indigo-500 to-violet-600",
  },
  {
    text: "I've tried Vercel, Netlify, Railway. Deployr is the only one where I didn't spend a week reading documentation just to get a monorepo working.",
    name: "Marcus T.",
    role: "CTO",
    initials: "MT",
    gradient: "from-[#22d3a8] to-teal-600",
  },
  {
    text: "The build log streaming is what got me. Watching it deploy in real time feels like actually understanding what's happening to your code.",
    name: "Priya M.",
    role: "Principal Engineer",
    initials: "PM",
    gradient: "from-amber-400 to-orange-500",
  },
];

const FAQS = [
  {
    q: "What frameworks does Deployr support?",
    a: "Anything with a build step: Next.js, Vite, CRA, Astro, Remix, SvelteKit, Vue, Nuxt, and plain HTML. You configure your own build command and output directory — if it builds locally, it deploys.",
  },
  {
    q: "How do preview deployments work?",
    a: "Every non-main branch push gets a fully isolated deployment at a unique subdomain. Separate S3 prefix, separate Lambda function, separate environment variables. When the branch is deleted, the preview is cleaned up automatically.",
  },
  {
    q: "Can I use my own custom domain?",
    a: "Yes. Add a TXT record to verify ownership, point your DNS to our edge, and SSL is provisioned automatically. No certificate management needed on your end.",
  },
  {
    q: "How does billing work?",
    a: "The Hobby plan is free indefinitely with generous limits. Pro is a flat ₹1,600/month per user — no per-build charges, no bandwidth overage surprises.",
  },
  {
    q: "Do you support monorepos?",
    a: "Yes. Set a root directory per project and Deployr runs your build from that subdirectory. Multiple projects from the same repo, each with independent deploy settings and their own URL.",
  },
  {
    q: "What happens during a build?",
    a: "Deployr clones your repo, installs dependencies with your chosen package manager, runs your build command, then uploads the output to S3 and provisions Lambda@Edge. You can watch each step stream in real time in your dashboard.",
  },
];

// ─── Animation helpers ────────────────────────────────────────────────────────

function FadeIn({ children, delay = 0, className = "" }: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-indigo-500 dark:text-indigo-400 mb-3">
      {children}
    </p>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section className="px-6 py-24 bg-zinc-50 dark:bg-[#0a0a14]">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="mb-16 text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white text-balance">
            Three steps from code to live
          </h2>
        </FadeIn>

        <div className="relative grid md:grid-cols-3 gap-10 md:gap-6">
          <div className="absolute top-5 left-[calc(16.67%+1.5rem)] right-[calc(16.67%+1.5rem)] h-px bg-gradient-to-r from-zinc-200 via-indigo-300/50 to-zinc-200 dark:from-zinc-800/80 dark:via-indigo-500/25 dark:to-zinc-800/80 hidden md:block" />

          {HOW_IT_WORKS.map((step, i) => (
            <FadeIn key={step.title} delay={i * 0.1}>
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-[#0d0d18] border-2 border-indigo-500/50 flex items-center justify-center mb-6 z-10 shadow-sm shadow-indigo-500/10">
                  <step.icon size={16} className="text-indigo-500 dark:text-indigo-400" />
                </div>
                <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 mb-2">{step.step}</p>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-2 tracking-tight">{step.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-64">{step.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  return (
    <section className="px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="mb-14">
          <Eyebrow>What you get</Eyebrow>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white text-balance max-w-xl">
            Infrastructure that gets out of your way
          </h2>
          <p className="mt-4 text-zinc-500 dark:text-zinc-400 max-w-lg leading-relaxed text-sm">
            Deployr handles the S3 buckets, the Lambda functions, the CDN config, the SSL certs.
            You write code and push.
          </p>
        </FadeIn>

        {/* 2×2 larger cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {CAPABILITIES.map((c, i) => (
            <FadeIn key={c.title} delay={i * 0.08}>
              <SpotlightCard className={`p-7 border ${c.accent} h-full`}>
                <div className={`w-9 h-9 rounded-xl ${c.accent} border flex items-center justify-center mb-5`}>
                  <c.icon size={17} className={c.color} />
                </div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-2 tracking-tight">{c.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{c.desc}</p>
              </SpotlightCard>
            </FadeIn>
          ))}
        </div>

        {/* 4 smaller cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SMALL_FEATURES.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.06}>
              <SpotlightCard className="p-5 h-full">
                <f.icon size={15} className={`${f.color} mb-3`} />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5 tracking-tight">{f.title}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{f.desc}</p>
              </SpotlightCard>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="px-6 py-24 bg-zinc-50 dark:bg-[#0a0a14]">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="text-center mb-14">
          <Eyebrow>From developers</Eyebrow>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white">
            What developers say
          </h2>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <FadeIn key={t.name} delay={i * 0.1}>
              <div className="h-full bg-white dark:bg-[#0d0d18] border border-zinc-200 dark:border-white/[0.07] rounded-2xl p-7 flex flex-col shadow-sm">
                <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed flex-1">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="flex items-center gap-3 mt-7 pt-6 border-t border-zinc-100 dark:border-white/[0.05]">
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">{t.name}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{t.role}</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection({ ctaHref }: { ctaHref: string }) {
  const hobbyFeatures = [
    "3 deployments per project",
    "100 GB bandwidth / month",
    "1 M serverless invocations",
    "Custom domains",
    "Preview deployments",
    "Community support",
  ];
  const proFeatures = [
    "Unlimited deployments",
    "1 TB bandwidth / month",
    "10 M serverless invocations",
    "Custom domains",
    "Preview deployments",
    "Priority email support",
  ];

  return (
    <section className="px-6 py-24">
      <div className="max-w-4xl mx-auto">
        <FadeIn className="text-center mb-14">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white">
            Simple, honest pricing
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-3 text-sm">No per-build fees. No overage surprises. No lock-in.</p>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Hobby */}
          <FadeIn>
            <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.07] bg-white dark:bg-[#0d0d18] p-8 h-full flex flex-col">
              <h3 className="text-[10px] font-mono font-semibold uppercase tracking-widest text-zinc-500 mb-5">Hobby</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white">Free</span>
                <p className="text-xs text-zinc-500 mt-1.5">No credit card required</p>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {hobbyFeatures.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
                    <CheckCircle2 size={13} className="text-zinc-300 dark:text-zinc-600 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={ctaHref} className="block w-full text-center py-3 rounded-xl border border-zinc-200 dark:border-white/[0.09] text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition">
                Get started free
              </Link>
            </div>
          </FadeIn>

          {/* Pro */}
          <FadeIn delay={0.1}>
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.05] p-8 h-full flex flex-col relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[10px] font-mono font-semibold uppercase tracking-widest text-indigo-400">Pro</h3>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">Most popular</span>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white">₹1,600</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1.5">per user / month</p>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {proFeatures.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
                    <CheckCircle2 size={13} className="text-indigo-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/pricing" className="block w-full text-center py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-indigo-500/20">
                Upgrade to Pro
              </Link>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="px-6 py-20 bg-zinc-50 dark:bg-[#0a0a14]">
      <div className="max-w-3xl mx-auto">
        <FadeIn className="text-center mb-12">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white">
            Common questions
          </h2>
        </FadeIn>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <FadeIn key={i} delay={i * 0.03}>
              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.07] overflow-hidden bg-white dark:bg-[#0d0d18]">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left text-sm font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.015] transition gap-4"
                >
                  {faq.q}
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full border border-zinc-200 dark:border-white/[0.09]">
                    {open === i
                      ? <Minus size={9} className="text-zinc-500" />
                      : <Plus size={9} className="text-zinc-500" />
                    }
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-white/[0.04] pt-4">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { data: session } = useSession();
  const ctaHref = session ? "/dashboard" : "/auth";

  return (
    <div className="bg-white dark:bg-[#07070d] text-zinc-900 dark:text-zinc-100 min-h-screen font-sans selection:bg-indigo-500/20 overflow-x-hidden transition-colors duration-300">

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 dark:block hidden bg-[linear-gradient(rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_30%,transparent_100%)]" />
        <div className="absolute top-[-20%] left-[10%] w-[60%] h-[60%] bg-indigo-500/[0.07] dark:bg-indigo-500/[0.10] blur-[200px] rounded-full" />
        <div className="absolute top-[0%] right-[5%] w-[35%] h-[45%] bg-violet-500/[0.05] dark:bg-violet-500/[0.08] blur-[160px] rounded-full" />
      </div>

      <Header />

      <main className="relative z-10">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-32 pb-16 md:pt-44 md:pb-20 px-6">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-14 items-center">

            {/* Left column */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/[0.09] mb-7 text-[11px] font-medium text-zinc-500 dark:text-zinc-400"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#22d3a8] shadow-[0_0_6px_rgba(34,211,168,0.9)]" />
                Git push. Your site is live.
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.05, ease: "easeOut" }}
                className="text-5xl md:text-6xl lg:text-[4.5rem] font-bold tracking-tighter leading-[0.9] text-balance"
              >
                Deploy your app.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400">
                  Skip the ops.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.11, ease: "easeOut" }}
                className="mt-6 text-base text-zinc-500 dark:text-zinc-400 max-w-[28rem] leading-relaxed"
              >
                Push to GitHub and your site is live in seconds — with a preview URL
                for every branch, real-time build logs, global edge delivery, and no
                infrastructure to manage.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.17, ease: "easeOut" }}
                className="mt-9 flex flex-col sm:flex-row gap-3"
              >
                <Link
                  href={ctaHref}
                  className="group inline-flex items-center justify-center px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-xl shadow-indigo-500/20 text-sm gap-2"
                >
                  Start for free
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center justify-center px-7 py-3.5 text-sm font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/[0.09] rounded-xl hover:bg-zinc-200 dark:hover:bg-white/[0.07] transition"
                >
                  See how it works
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-400"
              >
                <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[#22d3a8]" /> Free plan, no credit card</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[#22d3a8]" /> Preview URL on every branch</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[#22d3a8]" /> Any framework with a build step</span>
              </motion.div>
            </div>

            {/* Right column: terminal */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.65, delay: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="hidden lg:block"
            >
              <TerminalDemo />
            </motion.div>
          </div>
        </section>

        {/* ── Framework ticker ─────────────────────────────────────────────── */}
        <FrameworkTicker />

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <div id="how-it-works">
          <HowItWorks />
        </div>

        {/* ── Capabilities ─────────────────────────────────────────────────── */}
        <CapabilitiesSection />

        {/* ── Testimonials ─────────────────────────────────────────────────── */}
        <TestimonialsSection />

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <PricingSection ctaHref={ctaHref} />

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <FAQSection />

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="px-6 py-24">
          <FadeIn>
            <div className="max-w-4xl mx-auto rounded-3xl bg-zinc-50 dark:bg-[#0d0d18] border border-zinc-200 dark:border-white/[0.07] p-12 md:p-20 text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.04] to-transparent pointer-events-none" />
              <div className="relative">
                <Eyebrow>Get started</Eyebrow>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-zinc-900 dark:text-white mb-5 text-balance">
                  Your code, live in seconds
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-base mb-9 max-w-sm mx-auto leading-relaxed">
                  Connect a repo, push, and watch the build log. No YAML, no config files, no surprises.
                </p>
                <Link
                  href={ctaHref}
                  className="inline-flex items-center gap-2 px-9 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition text-sm shadow-2xl shadow-indigo-500/20"
                >
                  Start deploying free
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          </FadeIn>
        </section>

      </main>

      <Footer />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      ` }} />
    </div>
  );
}
