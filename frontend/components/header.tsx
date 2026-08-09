"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { useEffect, useState } from "react";
import clsx from "clsx";

export function Header() {
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={clsx(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "backdrop-blur-xl bg-[#07070d]/80 border-b border-white/[0.07] shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-md group-hover:scale-105 transition">
            D
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Deployr
          </span>
        </Link>

        {/* Right Section */}
        <div className="flex items-center gap-5">
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-500">
            <Link href="/#features" className="hover:text-white transition">Features</Link>
            <Link href="/pricing" className="hover:text-white transition">Pricing</Link>
            <Link href="/about" className="hover:text-white transition">About</Link>
            <Link href="/contact" className="hover:text-white transition">Contact</Link>
          </nav>

          <ThemeToggle />

          {session ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <Link
              href="/auth"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition shadow-lg shadow-indigo-500/20"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
