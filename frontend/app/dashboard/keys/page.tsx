"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeySquare, Copy, Eye, EyeOff, Plus, AlertCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function ApiKeysPage() {
  const [showKey, setShowKey] = useState(false);

  const mockKeys = [
    { name: "Production CI/CD Deployments", key: "dep_live_8f92a1b3c4...", created: "2 days ago", lastUsed: "12 hours ago" },
    { name: "GitHub Actions", key: "dep_live_c7d8e9f0a1...", created: "1 month ago", lastUsed: "Just now" },
  ];

  function copyKey(k: string) {
    navigator.clipboard.writeText(k);
    toast.success("API Key copied to clipboard");
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-20">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
            API Keys
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm">
            Manage personal access tokens and project API keys for automated integrations.
          </p>
        </div>
        <Button className="bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl h-11 px-6 shadow-lg font-bold transition-all">
          <Plus size={16} className="mr-2" /> Generate New Key
        </Button>
      </div>

      <Card className="p-0 rounded-2xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl overflow-hidden relative">
        <div className="px-6 py-5 border-b border-zinc-150 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01]">
          <h3 className="font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <KeySquare size={18} className="text-zinc-400" />
            Active Tokens
          </h3>
        </div>

        <div className="divide-y divide-zinc-150 dark:divide-white/5">
          {mockKeys.map((k, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/50 dark:hover:bg-white/[0.01] transition-colors"
            >
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{k.name}</h4>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-mono mt-2">
                  <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded-md border border-zinc-200 dark:border-white/10 select-all">
                    {showKey ? k.key : "dep_live_••••••••••••••••••••"}
                  </div>
                  <button onClick={() => setShowKey(!showKey)} className="hover:text-indigo-500 transition-colors">
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => copyKey(k.key)} className="hover:text-indigo-500 transition-colors">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <div className="flex sm:flex-col gap-4 sm:gap-1 text-left sm:text-right text-[11px] text-zinc-400">
                <span className="flex items-center gap-1"><Clock size={12} className="sm:hidden" /> Created: {k.created}</span>
                <span>Last Used: {k.lastUsed}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-700 dark:text-amber-400">
        <AlertCircle size={20} className="shrink-0" />
        <p className="text-xs leading-relaxed">
          <strong>Security Warning:</strong> API keys grant full access to your account and resources. Never commit them to public repositories or share them in plaintext. If a key is compromised, delete it immediately and generate a new one.
        </p>
      </div>
    </div>
  );
}
