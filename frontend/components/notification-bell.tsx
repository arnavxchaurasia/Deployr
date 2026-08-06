"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await api.get("/notifications/unread-count");
      setUnreadCount(res.data.unreadCount ?? 0);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchUnread();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchUnread();
    }, 30000);
    return () => clearInterval(interval);
  }, [session, fetchUnread]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const res = await api.get("/notifications");
        setNotifications(res.data.notifications ?? []);
        setUnreadCount(res.data.unreadCount ?? 0);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    }
  }

  async function markAllRead() {
    try {
      await api.post("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // non-fatal
    }
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    api.post(`/notifications/${id}/read`).catch(() => {});
  }

  if (!session) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={toggleOpen}
        className="relative p-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-lg overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={18} className="animate-spin text-zinc-400" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-10">No notifications yet</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    className={`px-4 py-3 text-sm cursor-pointer ${n.read ? "opacity-60" : "bg-indigo-500/5"}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{n.title}</p>
                        {n.body && <p className="text-xs text-zinc-500 mt-0.5">{n.body}</p>}
                        <p className="text-[11px] text-zinc-400 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
