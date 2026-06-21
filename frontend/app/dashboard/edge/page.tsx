"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe2, MapPin, Zap, Shield, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function EdgeNetworkPage() {
  const regions = [
    { name: "Washington, D.C., USA", id: "iad1", latency: "12ms", status: "Operational" },
    { name: "London, UK", id: "lhr1", latency: "8ms", status: "Operational" },
    { name: "Frankfurt, Germany", id: "fra1", latency: "14ms", status: "Operational" },
    { name: "Singapore", id: "sin1", latency: "22ms", status: "Operational" },
    { name: "Tokyo, Japan", id: "hnd1", latency: "18ms", status: "Operational" },
    { name: "Sydney, Australia", id: "syd1", latency: "35ms", status: "Operational" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Edge Network
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Global routing, caching, and serverless compute regions.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="p-6 md:p-8 border-b border-zinc-150 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01]">
              <div className="flex items-center gap-3 mb-2">
                <Globe2 className="text-indigo-500" size={24} />
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Global Anycast Network</h3>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Your deployments are automatically cached and served from the edge node closest to your visitors, ensuring ultra-low latency worldwide.
              </p>
            </div>

            <div className="p-6 md:p-8 grid sm:grid-cols-2 gap-4 relative z-10">
              {regions.map((r, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={r.id} 
                  className="flex items-center justify-between p-4 rounded-xl border border-zinc-200/50 dark:border-white/10 bg-white dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MapPin size={16} className="text-zinc-400" />
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{r.id}</p>
                      <p className="text-xs text-zinc-500">{r.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{r.latency}</p>
                    <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                      {r.status}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
              <Zap className="text-indigo-500" size={24} />
            </div>
            <h4 className="font-bold text-zinc-900 dark:text-white mb-2">Smart Routing</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              Traffic is intelligently routed to avoid network congestion. Asset caching happens automatically at the edge without manual configuration.
            </p>
            <Button className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl h-10 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
              Configure Caching
            </Button>
          </Card>

          <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl relative overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 border border-emerald-500/20">
              <Shield className="text-emerald-500" size={24} />
            </div>
            <h4 className="font-bold text-zinc-900 dark:text-white mb-2">DDoS Protection</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
              Enterprise-grade mitigation is active on all edge nodes, protecting your applications from L3/L4 and L7 volumetric attacks out of the box.
            </p>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
