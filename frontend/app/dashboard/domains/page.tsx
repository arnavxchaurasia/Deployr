import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Globe2, Construction } from "lucide-react";

export default function DomainsPage() {
  return (
    <div className="w-full max-w-7xl mx-auto pb-20 animate-fadeIn">
      {/* Console Top Navigation */}
      <div className="flex items-center gap-6 border-b border-zinc-200 dark:border-white/10 pb-4 mb-8 overflow-x-auto scrollbar-none">
        <Link href="/dashboard" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors whitespace-nowrap">
          Overview
        </Link>
        <Link href="/dashboard/integrations" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors whitespace-nowrap">
          Integrations
        </Link>
        <Link href="/dashboard/activity" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors whitespace-nowrap">
          Activity
        </Link>
        <Link href="/dashboard/domains" className="text-sm font-semibold text-zinc-900 dark:text-white border-b-2 border-indigo-500 pb-4 -mb-[17px] whitespace-nowrap">
          Domains
        </Link>
        <Link href="/dashboard/usage" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white pb-4 -mb-[17px] transition-colors whitespace-nowrap">
          Usage
        </Link>
      </div>

      <div className="flex flex-col items-center justify-center p-20 mt-10 text-center border border-dashed border-zinc-300 dark:border-white/10 rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/20 backdrop-blur-md">
        <div className="w-20 h-20 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 flex items-center justify-center mb-6 shadow-xl relative">
          <Globe2 size={32} className="text-indigo-500" />
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center border border-white dark:border-zinc-900">
            <Construction size={14} className="text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-white mb-3">
          Custom Domains
        </h2>
        <p className="text-sm text-zinc-500 max-w-md mb-8">
          Manage your custom domain names, SSL certificates, and DNS settings for all your hosted projects. Coming soon.
        </p>
        <Link href="/dashboard">
          <Button className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 rounded-xl px-8 font-bold shadow-xl transition-all">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
