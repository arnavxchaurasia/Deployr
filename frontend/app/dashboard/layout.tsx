"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  FolderGit2,
  Activity,
  BarChart2,
  Globe2,
  TerminalSquare,
  Settings,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { GlobalSearch } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";

type NavItem = {
  label: string;
  href: string;
  icon: any;
  disabled?: boolean;
};

const navItems: NavItem[] = [
  { label: "Overview",    href: "/dashboard",                   icon: LayoutDashboard },
  { label: "Deployments", href: "/dashboard/projects",          icon: FolderGit2 },
  { label: "Activity",    href: "/dashboard/activity",          icon: Activity },
  { label: "Usage",       href: "/dashboard/usage",             icon: BarChart2 },
  { label: "Domains",     href: "/dashboard/domains",           icon: Globe2 },
  { label: "API Keys",    href: "/dashboard/keys",              icon: TerminalSquare },
  { label: "Security",    href: "/dashboard/settings/security", icon: ShieldCheck },
  { label: "Settings",    href: "/dashboard/settings",          icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<"FREE" | "PRO" | "ENTERPRISE" | null>(null);

  useEffect(() => {
    async function checkVerification() {
      try {
        const res = await api.get("/auth/me");
        setEmailVerified(res.data?.emailVerified ?? false);
        setPlan(res.data?.plan ?? "FREE");
      } catch (err) {
        console.error("Layout verification check error:", err);
      }
    }
    checkVerification();
  }, [pathname]);

  useEffect(() => {
    function handleVerificationUpdate(e: Event) {
      const customEvent = e as CustomEvent;
      if (customEvent.detail !== undefined) {
        setEmailVerified(customEvent.detail);
      }
    }
    window.addEventListener("user-verification-updated", handleVerificationUpdate);
    return () => {
      window.removeEventListener("user-verification-updated", handleVerificationUpdate);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Background glow to match the premium theme */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px] mix-blend-normal" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <Header />

      <div className="flex flex-1 min-h-0 pt-16">
        {/* Toggleable Sidebar */}
        <motion.aside
          initial={false}
          animate={{ width: isSidebarOpen ? 260 : 80 }}
          className="hidden md:flex flex-col border-r border-zinc-200 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-xl relative z-20"
        >
          {/* Toggle Button */}
          <div className="p-4 flex justify-end">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
            >
              {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    item.disabled && "opacity-40 pointer-events-none grayscale",
                    !item.disabled && !isActive && "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100",
                    isActive && "bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                  )}
                  title={!isSidebarOpen ? item.label : undefined}
                >
                  <item.icon size={20} className={clsx(isActive && "drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]")} />
                  
                  <AnimatePresence mode="wait">
                    {isSidebarOpen && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Active Indicator Line */}
                  {isActive && isSidebarOpen && (
                    <motion.div layoutId="active-indicator" className="absolute left-0 w-1 h-6 bg-indigo-500 rounded-r-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="p-4">
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 p-4"
                >
                  {plan === "PRO" || plan === "ENTERPRISE" ? (
                    <>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Zap size={11} className="text-indigo-500" />
                        <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                          {plan === "ENTERPRISE" ? "Enterprise" : "Pro"}
                        </h4>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">All features unlocked.</p>
                    </>
                  ) : (
                    <>
                      <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Hobby Plan</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Upgrade for more bandwidth and features.</p>
                      <Link
                        href="/dashboard/billing"
                        className="block w-full text-center text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-1.5 transition-colors"
                      >
                        Upgrade to Pro
                      </Link>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
          <div className="flex justify-end mb-4">
            <GlobalSearch />
          </div>
          {emailVerified === false && (
            <div className="mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-600 dark:text-amber-400">
              <div className="flex items-start sm:items-center gap-3">
                <AlertTriangle className="shrink-0 mt-0.5 sm:mt-0 text-amber-500" size={20} />
                <div>
                  <p className="font-semibold text-sm">Please verify your email address</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Your email is unverified. To deploy applications, please verify your email.
                  </p>
                </div>
              </div>
              <Link 
                href="/dashboard/settings?triggerVerify=true" 
                className="shrink-0 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-semibold rounded-xl h-9 px-4 flex items-center justify-center text-sm transition-all duration-200 shadow-md shadow-amber-500/10"
              >
                Verify Now
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>

      <Footer />
    </div>
  );
}
