"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Plus, Search, Server, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";

export default function DatabasesPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-20">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
            Serverless Databases
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
            Fully managed Postgres, Redis, and Blob storage at the edge.
          </p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-6 shadow-lg shadow-indigo-500/10 font-bold transition-all">
          <Plus size={16} className="mr-2" /> Create Database
        </Button>
      </div>

      <div className="flex items-center gap-4 border-b border-zinc-200 dark:border-white/10 pb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-3 text-zinc-400" />
          <Input 
            placeholder="Search databases..." 
            className="pl-10 h-11 bg-white dark:bg-black/40 border-zinc-200 dark:border-white/10 rounded-xl"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { type: "Postgres", icon: Server, color: "text-blue-500", desc: "Relational database built for the serverless edge." },
          { type: "Redis", icon: Database, color: "text-red-500", desc: "In-memory data store for global state and caching." },
          { type: "Blob", icon: Server, color: "text-indigo-500", desc: "S3-compatible object storage for assets and files." },
        ].map((db, i) => (
          <motion.div 
            key={db.type}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="p-6 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md hover:bg-white/60 dark:hover:bg-white/[0.02] shadow-sm hover:shadow-xl transition-all group cursor-pointer h-full flex flex-col">
              <div className={`w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 flex items-center justify-center mb-4 ${db.color}`}>
                <db.icon size={24} />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-2">{db.type}</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 flex-1">{db.desc}</p>
              <div className="mt-6 pt-4 border-t border-zinc-150 dark:border-white/5 text-xs font-semibold text-indigo-500 flex items-center gap-1 group-hover:text-indigo-600 transition-colors">
                Learn more <span className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">→</span>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-8 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30">
            <Sparkles size={32} className="text-indigo-500" />
          </div>
          <div className="text-center md:text-left flex-1">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Zero-config Connection Strings</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Your deployments automatically receive environment variables to connect securely to your databases. No manual IP whitelisting or credential copying required.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
