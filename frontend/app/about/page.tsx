import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 flex flex-col">
      <Header />
      
      <main className="flex-1 pt-32 pb-20 px-6 max-w-4xl mx-auto w-full">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-8">About Deployr</h1>
        
        <div className="prose prose-zinc dark:prose-invert max-w-none text-lg leading-relaxed">
          <p className="mb-6">
            We built Deployr because we believe developers shouldn't have to choose between simplicity and power. 
            Historically, you either use a simple PaaS that limits your architecture, or you manage complex AWS/Kubernetes 
            infrastructure yourself.
          </p>

          <p className="mb-6">
            <strong>Deployr bridges that gap.</strong> We offer the instant, git-driven workflow you love, powered by a 
            transparent, scalable event-driven architecture using Kafka, PostgreSQL, and AWS ECS.
          </p>

          <h2 className="text-2xl font-bold mt-12 mb-4">Our Mission</h2>
          <p className="mb-6">
            To empower teams to ship faster and scale without boundaries. We handle the infrastructure, edge caching, 
            and rollbacks so you can focus strictly on building great products.
          </p>

          <div className="mt-12 p-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl border border-indigo-100 dark:border-indigo-900">
            <h3 className="text-xl font-semibold mb-3">Join the team</h3>
            <p className="mb-6 text-zinc-600 dark:text-zinc-300">
              We are always looking for passionate platform engineers, distributed systems experts, and product designers.
            </p>
            <Link href="/contact" className="inline-block font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
              View Open Roles &rarr;
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
