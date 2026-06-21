import { Card } from "@/components/ui/card";
import { FolderGit2, Rocket, Globe2, Command } from "lucide-react";

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20 animate-fadeIn">
      <div className="space-y-4 border-b border-zinc-200 dark:border-white/10 pb-8">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
          Documentation
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-lg">
          Learn how to deploy your applications to the edge network in seconds.
        </p>
      </div>

      <div className="space-y-12">
        {/* Step 1 */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
              1
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Connect your repository</h2>
          </div>
          <Card className="p-6 sm:p-8 rounded-3xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl ml-0 sm:ml-14">
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center shrink-0">
                <FolderGit2 size={32} className="text-zinc-500" />
              </div>
              <div className="space-y-3">
                <p className="text-zinc-600 dark:text-zinc-300">
                  Start by clicking the <strong>"New Project"</strong> button in your dashboard. You will be prompted to enter the URL of your GitHub repository.
                </p>
                <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-xl text-sm font-mono text-zinc-600 dark:text-zinc-400">
                  https://github.com/username/my-awesome-app
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Step 2 */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
              2
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Trigger a deployment</h2>
          </div>
          <Card className="p-6 sm:p-8 rounded-3xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl ml-0 sm:ml-14">
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center shrink-0">
                <Rocket size={32} className="text-emerald-500" />
              </div>
              <div className="space-y-3">
                <p className="text-zinc-600 dark:text-zinc-300">
                  Once your project is created, click the <strong>"Deploy"</strong> button. Our build servers will automatically pull your code, install dependencies, and run the build process.
                </p>
                <p className="text-sm text-zinc-500 border-l-2 border-indigo-500 pl-4 py-1 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-r-lg">
                  You can watch the live build logs in realtime while your application is compiling!
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Step 3 */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
              3
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Visit your live site</h2>
          </div>
          <Card className="p-6 sm:p-8 rounded-3xl border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-xl ml-0 sm:ml-14">
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center shrink-0">
                <Globe2 size={32} className="text-indigo-500" />
              </div>
              <div className="space-y-3 w-full">
                <p className="text-zinc-600 dark:text-zinc-300">
                  As soon as the build finishes, your site is instantly propagated across our global edge network. A unique `.deployr.app` subdomain will be assigned to your project.
                </p>
                <div className="mt-4 flex items-center justify-between p-4 bg-zinc-900 text-white rounded-xl shadow-inner">
                  <div className="font-mono text-sm">https://my-app.deployr.app</div>
                  <div className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">200 OK</div>
                </div>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
