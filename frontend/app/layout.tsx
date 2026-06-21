import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Deployr | The Next-Gen Platform Engineering Cloud",
    template: "%s | Deployr",
  },
  description:
    "Deployr is a premium, enterprise-grade deployment platform. Push your Git repository to automatically build, cache, and deploy globally in seconds.",
  keywords: [
    "Platform Engineering",
    "PaaS",
    "deployment platform",
    "Vercel alternative",
    "devops",
    "cloud hosting",
    "CI/CD",
    "container deployment",
    "PostgreSQL",
    "Edge Caching",
    "Next.js hosting"
  ],
  authors: [{ name: "Deployr Team", url: "https://deployr.com" }],
  creator: "Deployr Inc.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Deployr | The Next-Gen Platform Engineering Cloud",
    description:
      "Push your repo. We build it. We deploy it. Instantly. Experience the ultimate PaaS tailored for serious builders.",
    url: "/",
    siteName: "Deployr",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Deployr - Premium Deployment Platform",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deployr | The Next-Gen Platform Engineering Cloud",
    description:
      "A modern, robust Git-based deployment platform featuring global edge caching and instant rollbacks.",
    images: ["/og-image.png"],
    creator: "@deployrHQ",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* ✅ Google AdSense (Replace with your publisher ID later) */}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXX"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>

      <body
        className={`
          ${geistSans.variable}
          ${geistMono.variable}
          antialiased
          selection:bg-indigo-500/30
        `}
      >
        <Providers>
          {/* Subtle background grid */}
          <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_center,_rgba(99,102,241,0.15),_transparent_60%)]" />

          {children}
        </Providers>
      </body>
    </html>
  );
}
