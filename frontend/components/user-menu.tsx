"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, User, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  /* ---------------------------
     Close on outside click
  ---------------------------- */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        open &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, [open]);

  /* ---------------------------
     Close on Escape key
  ---------------------------- */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () =>
      document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Closed directly in render on pathname change

  if (!session?.user) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-zinc-400"
      >
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt="avatar"
            width={32}
            height={32}
            unoptimized
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        )}
        <ChevronDown size={16} />
      </button>

      {open && (
        <div
          role="menu"
          tabIndex={-1}
          className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-2 z-50"
        >
          <div className="px-3 py-2 text-sm">
            <p className="font-medium">
              {session.user.name}
            </p>
            <p className="text-zinc-500 text-xs truncate">
              {session.user.email}
            </p>
          </div>

          <div className="border-t my-2 dark:border-zinc-800" />

          <Link
            href="/dashboard/settings"
            role="menuitem"
            tabIndex={0}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:bg-zinc-100 dark:focus:bg-zinc-800 outline-none"
          >
            <User size={16} />
            Profile
          </Link>

          <button
            role="menuitem"
            tabIndex={0}
            onClick={() =>
              signOut({ callbackUrl: "/auth" })
            }
            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:bg-zinc-100 dark:focus:bg-zinc-800 outline-none text-red-600"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
