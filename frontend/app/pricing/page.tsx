"use client";

import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import Script from "next/script";
import { useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Types for Razorpay Window
declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function PricingPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleProUpgrade = async () => {
    setLoading(true);
    try {
      // 1. Create order on the backend
      const res = await api.post("/payment/create-order");
      const { orderId, amount, keyId } = res.data;

      // 2. Initialize Razorpay Checkout
      const options = {
        key: keyId,
        amount: amount.toString(),
        currency: "INR",
        name: "Deployr Pro",
        description: "Upgrade to Pro Tier",
        image: "https://your-logo-url.com/logo.png",
        order_id: orderId,
        handler: async function (response: any) {
          try {
            // 3. Verify payment on backend
            const { data } = await api.post("/payment/verify", {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (data.success) {
              toast.success("Payment successful! You are now a Pro user.");
              router.push("/dashboard");
            } else {
              toast.error("Payment verification failed.");
            }
          } catch (err) {
            console.error(err);
            toast.error("Payment verification failed.");
          }
        },
        prefill: {
          name: "User",
          email: "",
          contact: ""
        },
        theme: {
          color: "#4f46e5"
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        toast.error("Payment Failed: " + response.error.description);
      });
      
      rzp.open();
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 401) {
        router.push("/auth");
      } else {
        toast.error("Failed to initiate checkout. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 flex flex-col">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      <Header />
      
      <main className="flex-1 pt-32 pb-20 px-6 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Simple, transparent pricing</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Start for free, scale when you need to. No hidden fees or surprise overages.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Hobby */}
          <div className="p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <h3 className="text-xl font-semibold mb-2">Hobby</h3>
            <p className="text-zinc-500 mb-6">For personal projects</p>
            <div className="mb-6">
              <span className="text-4xl font-bold">₹0</span>
              <span className="text-zinc-500">/mo</span>
            </div>
            <ul className="space-y-4 mb-8">
              {['1 Project', '100GB Bandwidth', 'Community Support', 'Deploy from CLI'].map(feature => (
                <li key={feature} className="flex items-center gap-3">
                  <Check size={18} className="text-indigo-500" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <Link href="/auth" className="block w-full text-center py-3 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
              Get Started
            </Link>
          </div>

          {/* Pro */}
          <div className="p-8 rounded-3xl border-2 border-indigo-500 bg-white dark:bg-zinc-900 shadow-xl relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
              Most Popular
            </div>
            <h3 className="text-xl font-semibold mb-2">Pro</h3>
            <p className="text-zinc-500 mb-6">For serious builders</p>
            <div className="mb-6">
              <span className="text-4xl font-bold">₹1,600</span>
              <span className="text-zinc-500">/mo per user</span>
            </div>
            <ul className="space-y-4 mb-8">
              {['Unlimited Projects', '1TB Bandwidth', 'Priority Support', 'Custom Domains', 'Analytics Dashboard'].map(feature => (
                <li key={feature} className="flex items-center gap-3">
                  <Check size={18} className="text-indigo-500" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <button 
              onClick={handleProUpgrade}
              disabled={loading}
              className="w-full flex items-center justify-center py-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-md disabled:opacity-70"
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Upgrade to Pro"}
            </button>
          </div>

          {/* Enterprise */}
          <div className="p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <h3 className="text-xl font-semibold mb-2">Enterprise</h3>
            <p className="text-zinc-500 mb-6">For large organizations</p>
            <div className="mb-6">
              <span className="text-4xl font-bold">Custom</span>
            </div>
            <ul className="space-y-4 mb-8">
              {['Dedicated Infrastructure', 'SAML SSO', '99.99% SLA', 'Account Manager'].map(feature => (
                <li key={feature} className="flex items-center gap-3">
                  <Check size={18} className="text-indigo-500" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <Link href="/contact" className="block w-full text-center py-3 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
              Contact Sales
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
