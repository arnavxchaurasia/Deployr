"use client";

import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useState } from "react";

export default function ContactPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setTimeout(() => setStatus("sent"), 1000);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 flex flex-col">
      <Header />
      
      <main className="flex-1 pt-32 pb-20 px-6 max-w-xl mx-auto w-full">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Contact Us</h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-10">
          Have a question or want to discuss enterprise pricing? Fill out the form below and our team will get back to you shortly.
        </p>

        {status === "sent" ? (
          <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-2xl border border-emerald-200 dark:border-emerald-800">
            <h3 className="font-semibold text-lg mb-2">Message Sent!</h3>
            <p>Thank you for reaching out. We will respond within 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input required type="text" className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Jane Doe" />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input required type="email" className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="jane@example.com" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Message</label>
              <textarea required rows={5} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-indigo-500 outline-none transition resize-none" placeholder="How can we help?" />
            </div>

            <button disabled={status === "sending"} className="w-full py-4 rounded-xl font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-70">
              {status === "sending" ? "Sending..." : "Send Message"}
            </button>
          </form>
        )}
      </main>

      <Footer />
    </div>
  );
}
