"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { 
  ChevronRight, 
  Terminal as TerminalIcon, 
  Zap, 
  Globe2, 
  ShieldCheck, 
  Database, 
  Server, 
  BrainCircuit,
  Command,
  Cpu,
  Layers,
  Github,
  CloudLightning,
  GitCommit
} from "lucide-react";

/* ------------------------------------------------------------------
   Pipeline Visualizer Component (Replaces basic terminal)
------------------------------------------------------------------ */
function PipelineVisualizer() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timeouts = [
      setTimeout(() => setStep(1), 1000), // Push
      setTimeout(() => setStep(2), 2500), // Build
      setTimeout(() => setStep(3), 4000), // Edge
      setTimeout(() => setStep(4), 5500), // Live
    ];
    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative w-full max-w-5xl mx-auto h-[400px] flex items-center justify-between px-10 md:px-20">
      {/* Background glowing line connecting everything */}
      <div className="absolute top-1/2 left-[10%] right-[10%] h-[2px] bg-zinc-200 dark:bg-white/5 -translate-y-1/2 rounded-full overflow-hidden">
        <motion.div 
          initial={{ x: "-100%" }}
          animate={{ x: step >= 4 ? "100%" : step === 3 ? "60%" : step === 2 ? "30%" : step === 1 ? "0%" : "-100%" }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          className="w-1/3 h-full bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_20px_rgba(99,102,241,0.5)] dark:shadow-[0_0_20px_rgba(99,102,241,0.8)]"
        />
      </div>

      {/* Node 1: GitHub Push */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
        className="relative z-10 flex flex-col items-center gap-4"
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border transition-all duration-700 ${step >= 1 ? 'bg-white dark:bg-[#111] border-zinc-300 dark:border-white/20 shadow-[0_0_40px_rgba(0,0,0,0.1)] dark:shadow-[0_0_40px_rgba(255,255,255,0.1)]' : 'bg-zinc-50 dark:bg-black border-zinc-200 dark:border-white/5'}`}>
          <Github className={`w-8 h-8 ${step >= 1 ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-600'}`} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wider uppercase">git push</p>
          <p className="text-xs text-zinc-500 font-mono mt-1">main</p>
        </div>
      </motion.div>

      {/* Node 2: Build Engine */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4 }}
        className="relative z-10 flex flex-col items-center gap-4"
      >
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center border transition-all duration-700 ${step >= 2 ? 'bg-white dark:bg-[#111] border-indigo-300 dark:border-indigo-500/50 shadow-[0_0_60px_rgba(99,102,241,0.2)] dark:shadow-[0_0_60px_rgba(99,102,241,0.3)]' : 'bg-zinc-50 dark:bg-black border-zinc-200 dark:border-white/5'}`}>
          <Cpu className={`w-10 h-10 ${step >= 2 ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-600'}`} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wider uppercase">Build Engine</p>
          <p className="text-xs text-indigo-500 dark:text-indigo-400/80 font-mono mt-1">{step >= 2 ? 'Compiling...' : 'Waiting'}</p>
        </div>
      </motion.div>

      {/* Node 3: Edge Network */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6 }}
        className="relative z-10 flex flex-col items-center gap-4"
      >
        <div className={`w-24 h-24 rounded-3xl flex items-center justify-center border transition-all duration-700 ${step >= 3 ? 'bg-white dark:bg-[#111] border-purple-300 dark:border-purple-500/50 shadow-[0_0_80px_rgba(168,85,247,0.2)] dark:shadow-[0_0_80px_rgba(168,85,247,0.3)]' : 'bg-zinc-50 dark:bg-black border-zinc-200 dark:border-white/5'}`}>
          <Globe2 className={`w-12 h-12 ${step >= 3 ? 'text-purple-500 dark:text-purple-400' : 'text-zinc-400 dark:text-zinc-600'}`} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wider uppercase">Global Edge</p>
          <p className="text-xs text-purple-500 dark:text-purple-400/80 font-mono mt-1">{step >= 3 ? '280 Nodes Synced' : 'Idle'}</p>
        </div>
      </motion.div>

      {/* Node 4: Live URL */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.8 }}
        className="relative z-10 flex flex-col items-center gap-4"
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border transition-all duration-700 ${step >= 4 ? 'bg-white dark:bg-[#111] border-emerald-300 dark:border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.2)] dark:shadow-[0_0_50px_rgba(16,185,129,0.3)]' : 'bg-zinc-50 dark:bg-black border-zinc-200 dark:border-white/5'}`}>
          <Zap className={`w-8 h-8 ${step >= 4 ? 'text-emerald-500 dark:text-emerald-400 fill-emerald-500 dark:fill-emerald-400' : 'text-zinc-400 dark:text-zinc-600'}`} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wider uppercase">Live</p>
          <p className="text-xs text-emerald-500 dark:text-emerald-400/80 font-mono mt-1">200 OK</p>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Spotlight Feature Card Component
------------------------------------------------------------------ */
function SpotlightCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const div = divRef.current;
    const rect = div.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={`relative rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a] overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300 ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 z-10 dark:block hidden"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(255,255,255,0.06), transparent 40%)`,
        }}
      />
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 z-10 block dark:hidden"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(99,102,241,0.08), transparent 40%)`,
        }}
      />
      <div className="relative z-20">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Brand Marquee Component
------------------------------------------------------------------ */
function BrandTicker() {
  const brands = [
    { name: "Acme Corp", icon: Command },
    { name: "Globex", icon: Globe2 },
    { name: "Soylent", icon: Layers },
    { name: "Initech", icon: Cpu },
    { name: "Umbrella", icon: ShieldCheck },
    { name: "Cyberdyne", icon: BrainCircuit },
    { name: "Massive Dynamic", icon: Database },
  ];

  return (
    <div className="w-full overflow-hidden border-y border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#050505] py-12 relative">
      <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-zinc-50 dark:from-[#050505] to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-zinc-50 dark:from-[#050505] to-transparent z-10" />
      
      <div className="flex w-[200%] animate-[slide_40s_linear_infinite]">
        {[...brands, ...brands].map((brand, i) => (
          <div key={i} className="flex-1 flex items-center justify-center gap-3 opacity-40 dark:opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300 cursor-default">
            <brand.icon size={28} className="text-zinc-800 dark:text-white" />
            <span className="text-xl font-bold tracking-tight text-zinc-800 dark:text-white">{brand.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Main Landing Page
------------------------------------------------------------------ */
export default function LandingPage() {
  const { data: session } = useSession();
  const ctaHref = session ? "/dashboard" : "/auth";

  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const yParallax = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const opacityFade = useTransform(scrollYProgress, [0, 1], [1, 0]);

  return (
    // Restored adaptive Dark/Light mode base classes
    <div className="bg-white dark:bg-black text-zinc-900 dark:text-white min-h-screen font-sans selection:bg-indigo-500/30 overflow-hidden relative transition-colors duration-300">
      
      {/* Vercel-Style Animated Grid & Light Beams (Adaptive) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Dark Mode Grid */}
        <div className="absolute inset-0 hidden dark:block bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_10%,transparent_100%)]" />
        {/* Light Mode Grid */}
        <div className="absolute inset-0 block dark:hidden bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_10%,transparent_100%)]" />
        
        {/* Orbs */}
        <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] bg-indigo-500/10 dark:bg-indigo-500/20 blur-[150px] rounded-full mix-blend-multiply dark:mix-blend-screen pointer-events-none" />
        <div className="absolute top-0 right-[10%] w-[40%] h-[40%] bg-purple-500/10 dark:bg-purple-500/20 blur-[150px] rounded-full mix-blend-multiply dark:mix-blend-screen pointer-events-none" />
      </div>

      <Header />

      <main className="relative z-10">
        {/* HERO SECTION */}
        <section ref={heroRef} className="relative pt-40 pb-20 md:pt-56 md:pb-24 px-6 flex flex-col items-center text-center max-w-7xl mx-auto">
          <motion.div style={{ y: yParallax, opacity: opacityFade }} className="flex flex-col items-center w-full">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 backdrop-blur-md mb-8 shadow-sm dark:shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <span className="flex h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-[pulse_2s_ease-in-out_infinite] dark:shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">Deployr Edge Engine v3.0 is live</span>
              <ChevronRight size={14} className="text-zinc-500 ml-1" />
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
              className="text-6xl md:text-8xl lg:text-[8rem] font-bold tracking-tighter leading-[0.9]"
            >
              Develop. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-zinc-400 to-zinc-200 dark:from-white dark:to-white/40">Preview.</span> <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 filter drop-shadow-sm dark:drop-shadow-[0_0_40px_rgba(99,102,241,0.4)]">
                Ship.
              </span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
              className="mt-10 text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 max-w-3xl leading-relaxed font-medium"
            >
              Deployr is the platform for frontend developers, providing the speed and reliability innovators need to create at the moment of inspiration.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
              className="mt-12 flex flex-col sm:flex-row gap-6"
            >
              <Link
                href={ctaHref}
                className="group relative inline-flex items-center justify-center px-10 py-5 font-semibold text-white dark:text-black transition-all duration-300 bg-zinc-900 dark:bg-white rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-xl dark:shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)] dark:hover:shadow-[0_0_60px_-10px_rgba(255,255,255,0.8)] focus:outline-none"
              >
                Start Deploying
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/#features"
                className="inline-flex items-center justify-center px-10 py-5 font-semibold text-zinc-700 dark:text-white transition-all duration-300 bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 backdrop-blur-md"
              >
                Get a Demo
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* PIPELINE VISUALIZER */}
        <section className="relative w-full pb-32">
          <PipelineVisualizer />
        </section>

        {/* BRANDS TICKER */}
        <BrandTicker />

        {/* FEATURES GRID */}
        <section id="features" className="px-6 py-40 relative">
          <div className="max-w-7xl mx-auto">
            <div className="mb-24 text-center">
              <motion.h2 
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
                className="text-5xl md:text-6xl font-bold tracking-tighter mb-8 text-zinc-900 dark:text-white"
              >
                Zero Configuration. <br className="hidden md:block" />
                <span className="text-zinc-500">Infinite Scale.</span>
              </motion.h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: <Globe2 className="text-blue-500" />,
                  title: "Edge Network",
                  desc: "Deploy your code to our global edge network in milliseconds. Serve users from the node closest to them for zero-latency TTFB.",
                },
                {
                  icon: <Server className="text-indigo-500" />,
                  title: "Serverless Functions",
                  desc: "Write backend code in Next.js or Node.js and we automatically provision highly scalable serverless infrastructure.",
                },
                {
                  icon: <BrainCircuit className="text-purple-500" />,
                  title: "CI/CD Pipeline",
                  desc: "Every git push automatically triggers a secure, isolated build environment with instant preview URLs for your team.",
                },
                {
                  icon: <ShieldCheck className="text-emerald-500" />,
                  title: "Enterprise Security",
                  desc: "DDoS mitigation, WAF, and military-grade encryption for environment variables come standard out of the box.",
                },
                {
                  icon: <Database className="text-amber-500" />,
                  title: "Edge Analytics",
                  desc: "Understand your traffic with privacy-first, real-time analytics collected directly at the edge layer.",
                },
                {
                  icon: <Zap className="text-yellow-500" />,
                  title: "Instant Rollbacks",
                  desc: "Made a mistake? Switch your active production deployment back to any previous version instantly with zero downtime.",
                },
              ].map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  viewport={{ once: true, margin: "-50px" }}
                >
                  <SpotlightCard className="p-8 h-full">
                    <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center mb-6 border border-zinc-200 dark:border-white/10">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-3 tracking-tight text-zinc-900 dark:text-white">{feature.title}</h3>
                    <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
                      {feature.desc}
                    </p>
                  </SpotlightCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA SECTION */}
        <section className="px-6 py-40 max-w-5xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="rounded-[3rem] p-16 md:p-24 bg-zinc-50 dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 dark:from-indigo-500/10 to-transparent pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
            
            <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-zinc-900 dark:text-white">
              Ready to deploy?
            </h2>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto mb-12">
              Join thousands of innovators building the future of the web. Push to main and let our infrastructure do the rest.
            </p>
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center px-12 py-6 font-bold text-white dark:text-black transition-all bg-zinc-900 dark:bg-white rounded-full hover:scale-105 shadow-xl dark:shadow-[0_0_40px_rgba(255,255,255,0.3)] text-lg"
            >
              Start Building Now
            </Link>
          </motion.div>
        </section>
      </main>

      <Footer />
      
      {/* Global CSS animation for the marquee */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slide {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}} />
    </div>
  );
}
