"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { label: "Profile",  href: "/dashboard/settings" },
  { label: "Security", href: "/dashboard/settings/security" },
  { label: "Billing",  href: "/dashboard/settings/billing" },
  { label: "GitHub",   href: "/dashboard/settings/github" },
  { label: "Team",     href: "/dashboard/settings/team" },
  { label: "Compliance", href: "/dashboard/settings/compliance" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="text-zinc-500 mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map(tab => {
          const active =
            tab.href === pathname ||
            (tab.href !== "/dashboard/settings" &&
              pathname.startsWith(tab.href));

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "pb-3 text-sm transition",
                active
                  ? "border-b-2 border-black dark:border-white text-black dark:text-white font-medium"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Content */}
      <div className="animate-[fadeIn_0.25s_ease-out]">
        {children}
      </div>
    </div>
  );
}
