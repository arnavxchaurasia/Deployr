"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, BarChart3, Clock, ServerCrash, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

export default function ActivityPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Logs & Metrics
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
          Analytics, traffic logs, and performance metrics across all projects.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { title: "Total Edge Requests", value: "1.2M", change: "+14.5%", icon: Activity, color: "text-indigo-500" },
          { title: "Avg. Latency", value: "42ms", change: "-2.1%", icon: Clock, color: "text-emerald-500" },
          { title: "5xx Errors", value: "0.01%", change: "0%", icon: ServerCrash, color: "text-amber-500" },
        ].map((stat, i) => (
          <motion.div 
            key={stat.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{stat.title}</p>
                  <h3 className="text-3xl font-black mt-2 text-zinc-900 dark:text-white">{stat.value}</h3>
                  <p className={`text-xs mt-2 font-semibold ${stat.change.startsWith('+') ? 'text-emerald-500' : stat.change.startsWith('-') ? 'text-blue-500' : 'text-zinc-500'}`}>
                    {stat.change} vs last month
                  </p>
                </div>
                <div className={`p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 ${stat.color}`}>
                  <stat.icon size={20} />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-0 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden relative">
        <div className="p-6 md:p-8 border-b border-zinc-150 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01] flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <BarChart3 className="text-indigo-500" size={20} />
              Traffic Overview
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">30-day aggregate edge requests</p>
          </div>
          <Button variant="outline" className="rounded-xl h-9 text-xs">Export CSV</Button>
        </div>
        
        <div className="p-8 h-80 flex flex-col items-center justify-center text-center relative">
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
          <div className="w-full max-w-2xl h-full flex items-end justify-between gap-2 opacity-50 px-4">
            {/* Fake chart bars */}
            {[...Array(30)].map((_, i) => (
              <div 
                key={i} 
                className="w-full bg-indigo-500/20 hover:bg-indigo-500/50 transition-colors rounded-t-sm"
                style={{ height: `${Math.max(10, Math.random() * 100)}%` }}
              />
            ))}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 bg-white/80 dark:bg-black/80 backdrop-blur px-4 py-2 rounded-full border border-zinc-200 dark:border-white/10 shadow-lg">
              Detailed Analytics Included in Pro
            </h4>
          </div>
        </div>
      </Card>
    </div>
  );
}
