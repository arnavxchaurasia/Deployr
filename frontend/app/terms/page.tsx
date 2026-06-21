import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 flex flex-col">
      <Header />
      
      <main className="flex-1 pt-32 pb-20 px-6 max-w-4xl mx-auto w-full">
        <h1 className="text-4xl font-bold tracking-tight mb-8">Terms of Service</h1>
        
        <div className="prose prose-zinc dark:prose-invert max-w-none">
          <p>Last updated: October 2023</p>

          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using Deployr, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the service.
          </p>

          <h2>2. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are and will remain the exclusive property of Deployr Inc. and its licensors.
          </p>

          <h2>3. User Responsibilities</h2>
          <p>
            You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password. You agree not to disclose your password to any third party.
          </p>

          <h2>4. Prohibited Uses</h2>
          <p>
            You may use the Service only for lawful purposes and in accordance with Terms. You agree not to use the Service in any way that violates any applicable national or international law or regulation.
          </p>

          <h2>5. Changes to Terms</h2>
          <p>
            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. What constitutes a material change will be determined at our sole discretion.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
