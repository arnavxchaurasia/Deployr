"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import {
  ArrowUpRight, ChevronRight, CheckCircle2, Plus, Minus,
  GitBranch, Globe2, Lock, Activity, RefreshCw, Shield,
  Webhook, BarChart3, Terminal, GitPullRequest,
} from "lucide-react";

// ─── Custom Cursor ─────────────────────────────────────────────────────────────

function CustomCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [ring, setRing] = useState({ x: -100, y: -100 });
  const [hovering, setHovering] = useState(false);
  const ringRef = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    const checkHover = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      setHovering(!!el.closest('a, button, [data-cursor-hover]'));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mousemove', checkHover);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const animate = () => {
      setRing(prev => {
        const next = {
          x: lerp(prev.x, pos.x, 0.12),
          y: lerp(prev.y, pos.y, 0.12),
        };
        ringRef.current = next;
        return next;
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousemove', checkHover);
      cancelAnimationFrame(rafRef.current);
    };
  }, [pos.x, pos.y]);

  return (
    <>
      {/* Dot */}
      <div
        className="fixed z-[9999] pointer-events-none mix-blend-difference"
        style={{ left: pos.x - 4, top: pos.y - 4, transform: 'translateZ(0)' }}
      >
        <div className="w-2 h-2 rounded-full bg-white" />
      </div>
      {/* Ring */}
      <div
        className="fixed z-[9998] pointer-events-none transition-[width,height,border-color] duration-200"
        style={{
          left: ring.x - (hovering ? 22 : 16),
          top: ring.y - (hovering ? 22 : 16),
          width: hovering ? 44 : 32,
          height: hovering ? 44 : 32,
          transform: 'translateZ(0)',
        }}
      >
        <div
          className="w-full h-full rounded-full border transition-colors duration-200"
          style={{ borderColor: hovering ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.35)' }}
        />
      </div>
    </>
  );
}

// ─── Noise overlay ─────────────────────────────────────────────────────────────

function Grain() {
  return (
    <div className="fixed inset-0 z-[9990] pointer-events-none opacity-[0.035]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '128px 128px',
      }}
    />
  );
}

// ─── Terminal Demo ─────────────────────────────────────────────────────────────

const LINES = [
  { t: "text-zinc-300", v: "$ git push origin main" },
  { t: "text-zinc-600 text-xs", v: "Enumerating objects: 23, done." },
  { t: "text-zinc-600 text-xs", v: "Writing objects: 100% | 4.21 KiB" },
  { t: "", v: "" },
  { t: "text-indigo-400 text-xs", v: "→ Deployr   Build queued for main (a3f7c21)" },
  { t: "", v: "" },
  { t: "text-emerald-400", v: "  ✓  Clone repository ................  0.4s" },
  { t: "text-emerald-400", v: "  ✓  npm ci .........................  11.2s" },
  { t: "text-emerald-400", v: "  ✓  npm run build ..................   6.8s" },
  { t: "text-emerald-400", v: "  ✓  Upload 1,847 files to S3 .......   1.1s" },
  { t: "text-emerald-400", v: "  ✓  Lambda@Edge provisioned ........   1.4s" },
  { t: "text-emerald-400", v: "  ✓  CDN invalidated ................   0.2s" },
  { t: "", v: "" },
  { t: "text-white font-semibold", v: "  ⚡ Deployed in 21.1s" },
  { t: "text-sky-400", v: "  ↗ https://my-app.deployr.app" },
];
const DELAYS = [0, 300, 580, 860, 1350, 1620, 2500, 4100, 5700, 7200, 8600, 8900, 9200, 10000, 10500];

function TerminalDemo() {
  const [key, setKey] = useState(0);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const ts = DELAYS.map((d, i) => setTimeout(() => setShown(i + 1), d + 500));
    const loop = setTimeout(() => setKey(k => k + 1), 16000);
    return () => { ts.forEach(clearTimeout); clearTimeout(loop); };
  }, [key]);

  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-indigo-500/[0.07] blur-3xl rounded-[40px] pointer-events-none" />
      <div className="relative font-mono text-sm rounded-2xl overflow-hidden border border-white/[0.08] bg-[#06060f] shadow-[0_40px_100px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.04]">
        <div className="flex items-center gap-1.5 px-4 py-3 bg-white/[0.025] border-b border-white/[0.06]">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[11px] text-zinc-600">zsh — my-app</span>
          <span className="ml-auto text-[11px] text-zinc-700">⬡ deployr</span>
        </div>
        <div className="p-5 min-h-[280px] leading-[1.7]">
          {LINES.slice(0, shown).map((l, i) => (
            <div key={i} className={`${l.t} whitespace-pre`}>{l.v || " "}</div>
          ))}
          {shown < LINES.length && (
            <span className="inline-block w-[7px] h-[1em] bg-indigo-400/60 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Animated counter ──────────────────────────────────────────────────────────

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const duration = 1600;
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          setCount(Math.round(ease * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [to]);

  return <span ref={ref}>{count}{suffix}</span>;
}

// ─── Marquee ───────────────────────────────────────────────────────────────────

const MARQUEE_ITEMS = [
  "Next.js", "React", "Vite", "Astro", "Remix", "SvelteKit",
  "Vue.js", "Nuxt", "TypeScript", "Node.js", "Bun", "Deno", "Solid.js",
];

function Marquee({ reverse = false }: { reverse?: boolean }) {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="flex overflow-hidden">
      <div
        className="flex shrink-0"
        style={{
          animation: `marquee ${reverse ? '-' : ''}${35}s linear infinite`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {items.map((name, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-3 px-6 text-sm font-medium text-zinc-600 whitespace-nowrap uppercase tracking-widest"
          >
            <span className="text-indigo-600">✦</span> {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Feature row ───────────────────────────────────────────────────────────────

const FEATURES = [
  {
    num: "01",
    icon: GitPullRequest,
    color: "text-violet-400",
    title: "Preview for every branch",
    desc: "Every PR gets a fully isolated deployment — its own S3 prefix, Lambda function, and environment variables. Share before you merge.",
    tags: ["Isolated", "Auto-cleanup", "Env vars"],
  },
  {
    num: "02",
    icon: Activity,
    color: "text-emerald-400",
    title: "Streaming build logs",
    desc: "Watch each step in real time over WebSocket. Clone, install, build, upload, provision — every line as it runs.",
    tags: ["WebSocket", "No polling", "Per-step"],
  },
  {
    num: "03",
    icon: Globe2,
    color: "text-sky-400",
    title: "Lambda@Edge delivery",
    desc: "Your SSR runs at the network edge. Static assets served from S3. 180+ PoPs worldwide. Low latency is the default.",
    tags: ["180+ PoPs", "S3 + Lambda", "CDN"],
  },
  {
    num: "04",
    icon: Lock,
    color: "text-amber-400",
    title: "AES-256 encrypted secrets",
    desc: "Environment variables encrypted at rest with AES-256-GCM. Scope to production, preview, or all — never stored in plaintext.",
    tags: ["AES-256-GCM", "Scoped", "Never logged"],
  },
  {
    num: "05",
    icon: RefreshCw,
    color: "text-indigo-400",
    title: "One-click rollbacks",
    desc: "Promote any previous deployment to production instantly. Zero downtime, zero drama.",
    tags: ["Instant", "Zero downtime", "Full history"],
  },
  {
    num: "06",
    icon: Shield,
    color: "text-pink-400",
    title: "Edge WAF & rate limiting",
    desc: "Bot protection, geo-blocking, and rate limits enforced at the Cloudflare edge — before requests hit your origin.",
    tags: ["Bot block", "Geo-fence", "Rate limit"],
  },
];

function FeaturesSection() {
  return (
    <section className="px-6 md:px-14 py-32">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-20 gap-8 flex-wrap">
          <motion.div
            initial={{ opacity: 1, x: 0 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0 }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-indigo-500 mb-4">Platform</p>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tighter text-white leading-[0.92]">
              Everything<br />
              <span className="text-zinc-500">you need.</span><br />
              Nothing<br />
              <span className="text-zinc-500">you don&apos;t.</span>
            </h2>
          </motion.div>
          <motion.p
            initial={{ opacity: 1 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0 }}
            transition={{ delay: 0.2 }}
            className="text-zinc-400 text-base leading-relaxed max-w-xs mt-4 self-end"
          >
            No patchwork of tools. One platform from git push to globally available — every layer observable.
          </motion.p>
        </div>

        <div className="space-y-0">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.num}
              initial={{ opacity: 1, y: 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0 }}
              transition={{ delay: 0.04, duration: 0.5 }}
              className="group"
            >
              <div className="flex items-start gap-8 md:gap-14 py-8 border-t border-white/[0.06] hover:bg-white/[0.015] transition-colors px-2 rounded-lg cursor-default">
                {/* Number */}
                <span className="text-xs font-mono text-zinc-700 group-hover:text-indigo-500 transition-colors pt-1 w-7 shrink-0">
                  {f.num}
                </span>

                {/* Icon */}
                <div className="shrink-0 w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center group-hover:border-white/[0.12] transition-colors">
                  <f.icon size={16} className={f.color} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-6 flex-wrap">
                    <h3 className="text-xl font-bold text-white tracking-tight">{f.title}</h3>
                    <div className="flex gap-2 flex-wrap">
                      {f.tags.map(tag => (
                        <span key={tag} className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/[0.07] text-zinc-500 group-hover:border-white/[0.12] transition-colors">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-500 mt-2 leading-relaxed max-w-2xl">{f.desc}</p>
                </div>

                {/* Arrow */}
                <ArrowUpRight
                  size={16}
                  className="text-zinc-700 group-hover:text-indigo-400 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0 mt-1.5"
                />
              </div>
            </motion.div>
          ))}
          <div className="border-t border-white/[0.06]" />
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ──────────────────────────────────────────────────────────────

const QUOTES = [
  {
    q: "We went from deploying once a week out of fear to merging freely. Preview URLs changed how our team works.",
    name: "Sarah K.", role: "Staff Engineer", grad: "from-indigo-500 to-violet-600", i: "SK",
  },
  {
    q: "I've tried Vercel, Netlify, Railway. Deployr is the only one where I didn't spend a week in docs just to get a monorepo working.",
    name: "Marcus T.", role: "CTO", grad: "from-emerald-500 to-teal-600", i: "MT",
  },
  {
    q: "The build log streaming is what got me. Watching it deploy in real time feels like actually understanding what's happening to your code.",
    name: "Priya M.", role: "Principal Engineer", grad: "from-amber-400 to-orange-500", i: "PM",
  },
];

function TestimonialsSection() {
  return (
    <section className="px-6 md:px-14 py-28 border-t border-white/[0.05]">
      <div className="max-w-7xl mx-auto">
        <motion.p
          initial={{ opacity: 1 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0 }}
          className="text-[10px] font-mono uppercase tracking-[0.22em] text-indigo-500 mb-16"
        >
          Developers
        </motion.p>

        <div className="grid md:grid-cols-3 gap-px bg-white/[0.05]">
          {QUOTES.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 1, y: 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-[#07070d] p-10 flex flex-col gap-8 hover:bg-white/[0.02] transition-colors group"
            >
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, j) => (
                  <svg key={j} className="w-3 h-3 fill-amber-400" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-zinc-300 text-base leading-relaxed flex-1">
                &ldquo;{t.q}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-6 border-t border-white/[0.05]">
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${t.grad} flex items-center justify-center text-white text-xs font-bold`}>
                  {t.i}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-zinc-600">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ───────────────────────────────────────────────────────────────────

function PricingSection({ ctaHref }: { ctaHref: string }) {
  const hobby = ["3 deployments / project", "100 GB bandwidth / month", "1M serverless invocations", "Custom domains + SSL", "Preview deployments"];
  const pro =   ["Unlimited deployments",   "1 TB bandwidth / month",  "10M serverless invocations","Custom domains + SSL", "Preview deployments", "Priority support"];
  return (
    <section className="px-6 md:px-14 py-28 border-t border-white/[0.05]">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-16 gap-8 flex-wrap">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-indigo-500 mb-4">Pricing</p>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tighter text-white leading-[0.92]">
              Simple,<br />
              <span className="text-zinc-500">honest pricing.</span>
            </h2>
          </div>
          <p className="text-zinc-500 text-sm max-w-xs">No per-build fees. No overage surprises. No lock-in.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-px bg-white/[0.05]">
          {/* Hobby */}
          <div className="bg-[#07070d] p-10 hover:bg-white/[0.015] transition-colors">
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-6">Hobby</p>
            <div className="mb-8">
              <span className="text-6xl font-bold tracking-tighter text-white">Free</span>
              <p className="text-xs text-zinc-600 mt-2">No credit card required</p>
            </div>
            <ul className="space-y-3 mb-10">
              {hobby.map(f => (
                <li key={f} className="flex items-center gap-3 text-sm text-zinc-400">
                  <CheckCircle2 size={13} className="text-zinc-700 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <Link href={ctaHref} className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 border border-white/[0.09] px-6 py-3 rounded-xl hover:bg-white/[0.04] transition group">
              Get started free <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>

          {/* Pro */}
          <div className="bg-[#07070d] p-10 relative overflow-hidden hover:bg-indigo-500/[0.03] transition-colors border border-indigo-500/20">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />
            <div className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Most popular
            </div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-indigo-500 mb-6">Pro</p>
            <div className="mb-8">
              <span className="text-6xl font-bold tracking-tighter text-white">₹1,600</span>
              <p className="text-xs text-zinc-600 mt-2">per user / month</p>
            </div>
            <ul className="space-y-3 mb-10">
              {pro.map(f => (
                <li key={f} className="flex items-center gap-3 text-sm text-zinc-300">
                  <CheckCircle2 size={13} className="text-indigo-500 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <Link href={ctaHref} className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl transition shadow-lg shadow-indigo-500/20 group">
              Upgrade to Pro <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ───────────────────────────────────────────────────────────────────────

const FAQS = [
  { q: "What frameworks does Deployr support?", a: "Anything with a build step: Next.js, Vite, CRA, Astro, Remix, SvelteKit, Vue, Nuxt, and plain HTML. You configure your build command and output directory." },
  { q: "How do preview deployments work?", a: "Every non-main branch push gets a fully isolated deployment at a unique subdomain — separate S3 prefix, Lambda function, and env vars. Auto-cleaned when the branch is deleted." },
  { q: "Can I use a custom domain?", a: "Yes. Add a TXT record to verify ownership, point DNS to our edge, and SSL is provisioned automatically." },
  { q: "How does billing work?", a: "Hobby is free indefinitely. Pro is ₹1,600/user/month — no per-build charges, no bandwidth surprises." },
  { q: "Do you support monorepos?", a: "Yes. Set a root directory per project — multiple projects from the same repo, independent deploy settings, separate URLs." },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="px-6 md:px-14 py-28 border-t border-white/[0.05]">
      <div className="max-w-7xl mx-auto grid md:grid-cols-[1fr_2fr] gap-16">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-indigo-500 mb-4">FAQ</p>
          <h2 className="text-4xl font-bold tracking-tighter text-white leading-[0.95]">
            Common<br />questions.
          </h2>
        </div>
        <div className="space-y-0">
          {FAQS.map((faq, i) => (
            <div key={i} className="border-t border-white/[0.06]">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between py-5 text-left gap-6 group"
              >
                <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition">{faq.q}</span>
                <span className="shrink-0 w-5 h-5 flex items-center justify-center border border-white/[0.09] rounded-full group-hover:border-indigo-500/50 transition">
                  {open === i ? <Minus size={9} className="text-zinc-400" /> : <Plus size={9} className="text-zinc-400" />}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <p className="pb-5 text-sm text-zinc-500 leading-relaxed">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          <div className="border-t border-white/[0.06]" />
        </div>
      </div>
    </section>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { data: session } = useSession();
  const ctaHref = session ? "/dashboard" : "/auth";

  return (
    <div className="bg-[#07070d] text-zinc-100 min-h-screen font-sans selection:bg-indigo-500/25 overflow-x-hidden cursor-none">

      <CustomCursor />
      <Grain />

      {/* ── Ambient background ───────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_20%,transparent_100%)]" />
        <div className="absolute -top-[20%] left-[5%] w-[60%] h-[60%] bg-indigo-600/[0.09] blur-[200px] rounded-full" />
        <div className="absolute top-[-5%] right-[0%] w-[35%] h-[45%] bg-violet-600/[0.07] blur-[160px] rounded-full" />
        <div className="absolute top-[50%] left-[-10%] w-[30%] h-[40%] bg-indigo-500/[0.04] blur-[140px] rounded-full" />
      </div>

      <Header />

      <main className="relative z-10">

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section className="min-h-screen flex flex-col justify-center pt-24 pb-16 px-6 md:px-14">
          <div className="max-w-7xl mx-auto w-full">

            {/* Top row */}
            <div className="flex items-center justify-between mb-16 flex-wrap gap-4">
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-600"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                Platform Engineering Cloud
              </motion.div>
              <motion.div
                initial={{ opacity: 1, x: 0 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
                className="text-[11px] font-mono text-zinc-700 uppercase tracking-widest"
              >
                v2.0 — Now with edge WAF, A/B testing & tracing
              </motion.div>
            </div>

            {/* Main headline */}
            <div className="mb-16">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="text-[clamp(4rem,10vw,9rem)] font-bold tracking-[-0.04em] leading-[0.88] text-white"
              >
                Deploy your app.
              </motion.h1>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="text-[clamp(4rem,10vw,9rem)] font-bold tracking-[-0.04em] leading-[0.88] text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300"
              >
                Skip the ops.
              </motion.h1>
            </div>

            {/* Bottom row: desc + cta + terminal */}
            <div className="grid lg:grid-cols-[1fr_1.4fr] gap-12 lg:gap-20 items-end">
              <div>
                <motion.p
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22, duration: 0.6 }}
                  className="text-lg text-zinc-400 leading-relaxed max-w-sm mb-10"
                >
                  Push to GitHub and your site is live in seconds — with a preview URL for every branch, streaming build logs, and global edge delivery.
                </motion.p>

                <motion.div
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28, duration: 0.55 }}
                  className="flex flex-col sm:flex-row gap-3 mb-10"
                >
                  <Link
                    href={ctaHref}
                    data-cursor-hover
                    className="group inline-flex items-center gap-2 px-7 py-3.5 bg-white text-zinc-900 font-bold rounded-xl text-sm hover:bg-zinc-100 transition shadow-[0_0_40px_rgba(255,255,255,0.08)]"
                  >
                    Start deploying free
                    <ArrowUpRight size={15} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </Link>
                  <Link
                    href="#features"
                    data-cursor-hover
                    className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-semibold text-zinc-400 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition"
                  >
                    See features
                  </Link>
                </motion.div>

                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600"
                >
                  {["Free plan, no credit card", "Preview URL per branch", "Any framework"].map(s => (
                    <span key={s} className="flex items-center gap-1.5">
                      <CheckCircle2 size={11} className="text-emerald-600" /> {s}
                    </span>
                  ))}
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.85, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <TerminalDemo />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Marquee ───────────────────────────────────────────────────────── */}
        <div className="py-6 border-y border-white/[0.05] overflow-hidden space-y-3">
          <Marquee />
          <Marquee reverse />
        </div>

        {/* ── Stats ─────────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-14 py-24 border-b border-white/[0.05]">
          <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.05]">
            {[
              { val: 21, suffix: "s", label: "avg deploy time" },
              { val: 99, suffix: ".99%", label: "uptime SLA" },
              { val: 180, suffix: "+", label: "edge locations" },
              { val: 0, suffix: "", label: "YAML files required" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 1, y: 0 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0 }}
                transition={{ delay: i * 0.07 }}
                className="bg-[#07070d] px-10 py-12 hover:bg-white/[0.02] transition-colors"
              >
                <div className="text-5xl md:text-6xl font-bold tracking-tighter text-white mb-2 tabular-nums">
                  <Counter to={s.val} suffix={s.suffix} />
                </div>
                <div className="text-xs font-mono uppercase tracking-widest text-zinc-600">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <div id="features">
          <FeaturesSection />
        </div>

        {/* ── Testimonials ─────────────────────────────────────────────────── */}
        <TestimonialsSection />

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <PricingSection ctaHref={ctaHref} />

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <FAQSection />

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-14 py-32 border-t border-white/[0.05]">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 1, y: 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0 }}
            >
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-indigo-500 mb-8">Get started</p>
              <h2 className="text-[clamp(3rem,7vw,7rem)] font-bold tracking-[-0.04em] leading-[0.9] text-white mb-10 text-balance">
                Your code,<br />
                <span className="text-zinc-600">live in seconds.</span>
              </h2>
              <Link
                href={ctaHref}
                data-cursor-hover
                className="inline-flex items-center gap-3 px-10 py-5 bg-white text-zinc-900 font-bold text-base rounded-2xl hover:bg-zinc-100 transition shadow-[0_0_60px_rgba(255,255,255,0.07)] group"
              >
                Start deploying free
                <ArrowUpRight size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </motion.div>
          </div>
        </section>

      </main>

      <Footer />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
        * { cursor: none !important; }
      ` }} />
    </div>
  );
}
