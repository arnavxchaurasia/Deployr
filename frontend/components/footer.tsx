"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">

        {/* Brand */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-bold shadow-md">
              D
            </div>
            <span className="text-lg font-semibold">
              Deployr
            </span>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Modern deployment infrastructure powered by Kafka,
            ClickHouse, and distributed systems.
          </p>
        </div>

        {/* Product */}
        <div>
          <h4 className="font-semibold mb-5 text-sm uppercase tracking-wide text-zinc-800 dark:text-zinc-300">
            Product
          </h4>
          <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <li>
              <Link href="/dashboard" className="hover:text-indigo-600 transition">
                Dashboard
              </Link>
            </li>
            <li>
              <Link href="/new" className="hover:text-indigo-600 transition">
                New Project
              </Link>
            </li>
            <li>
              <Link href="/activity" className="hover:text-indigo-600 transition">
                Activity
              </Link>
            </li>
          </ul>
        </div>

        {/* Resources */}
        <div>
          <h4 className="font-semibold mb-5 text-sm uppercase tracking-wide text-zinc-800 dark:text-zinc-300">
            Resources
          </h4>
          <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <li>
              <Link href="#" className="hover:text-indigo-600 transition">
                Documentation
              </Link>
            </li>
            <li>
              <Link href="#" className="hover:text-indigo-600 transition">
                Public Status
              </Link>
            </li>
            <li>
              <Link href="#" className="hover:text-indigo-600 transition">
                Changelog
              </Link>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h4 className="font-semibold mb-5 text-sm uppercase tracking-wide text-zinc-800 dark:text-zinc-300">
            Legal & Support
          </h4>
          <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <li>
              <Link href="/privacy" className="hover:text-indigo-600 transition">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-indigo-600 transition">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-indigo-600 transition">
                Contact Us
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
        © {new Date().getFullYear()} Deployr. All rights reserved.
      </div>
    </footer>
  );
}
