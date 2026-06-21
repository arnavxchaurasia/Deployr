import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Zap, Server, Shield, CheckCircle2 } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-fadeIn">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Upgrade your workspace
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto">
          Get more power, bandwidth, and advanced features by upgrading to the Pro plan. Built for production workloads.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Free Plan */}
        <Card className="p-8 rounded-3xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl flex flex-col relative overflow-hidden">
          <div className="mb-8">
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Hobby</h3>
            <p className="text-sm text-zinc-500">Perfect for side projects and learning.</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">$0</span>
            <span className="text-zinc-500">/mo</span>
          </div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <CheckCircle2 size={18} className="text-zinc-400 shrink-0" />
              100 GB Bandwidth
            </li>
            <li className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <CheckCircle2 size={18} className="text-zinc-400 shrink-0" />
              1,000,000 Serverless Invocations
            </li>
            <li className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <CheckCircle2 size={18} className="text-zinc-400 shrink-0" />
              Community Support
            </li>
          </ul>
          <Button variant="outline" className="w-full rounded-xl border-zinc-200 dark:border-white/10 h-12">
            Current Plan
          </Button>
        </Card>

        {/* Pro Plan */}
        <Card className="p-8 rounded-3xl border-2 border-indigo-500 bg-gradient-to-b from-indigo-50/50 to-transparent dark:from-indigo-500/10 dark:to-transparent backdrop-blur-md shadow-2xl flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-[50px] pointer-events-none group-hover:bg-indigo-500/30 transition-colors duration-500" />
          <div className="mb-8 relative z-10">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">Pro</h3>
                <p className="text-sm text-zinc-500">For production apps and growing teams.</p>
              </div>
              <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-xs font-bold px-3 py-1 rounded-full">
                Popular
              </span>
            </div>
          </div>
          <div className="mb-8 relative z-10">
            <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">$20</span>
            <span className="text-zinc-500">/mo per user</span>
          </div>
          <ul className="space-y-4 mb-8 flex-1 relative z-10">
            <li className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <CheckCircle2 size={18} className="text-indigo-500 shrink-0" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">1 TB Bandwidth</span>
            </li>
            <li className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <CheckCircle2 size={18} className="text-indigo-500 shrink-0" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">10,000,000 Serverless Invocations</span>
            </li>
            <li className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <CheckCircle2 size={18} className="text-indigo-500 shrink-0" />
              DDoS Protection & WAF
            </li>
            <li className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <CheckCircle2 size={18} className="text-indigo-500 shrink-0" />
              Priority Email Support
            </li>
          </ul>
          <Button className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 h-12 font-bold relative z-10">
            <CreditCard size={18} className="mr-2" />
            Upgrade to Pro
          </Button>
        </Card>
      </div>
    </div>
  );
}
