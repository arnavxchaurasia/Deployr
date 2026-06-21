"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { socket } from "@/lib/socket";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { GitCommit, Rocket } from "lucide-react";
import { Button } from "./ui/button";

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Only connect if we have a logged-in user
    if (!session?.user?.id) return;

    socket.connect();
    socket.emit("subscribe_user", session.user.id);

    const handleCommitPushed = (payload: {
      projectId: string;
      projectName: string;
      branch: string;
      commitMessage: string;
    }) => {
      toast.custom(
        (t) => (
          <div className="flex w-full flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                <GitCommit size={16} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-zinc-100">
                  New commit pushed to {payload.projectName}
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  <span className="font-mono text-zinc-300">
                    {payload.branch}
                  </span>{" "}
                  · {payload.commitMessage}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toast.dismiss(t)}
                className="text-zinc-400 hover:text-zinc-100"
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
                onClick={async () => {
                  toast.dismiss(t);
                  try {
                    toast.loading("Starting deployment...", { id: "deploy" });
                    await api.post("/deploy", { projectId: payload.projectId });
                    toast.success("Deployment started!", { id: "deploy" });
                    router.push(`/dashboard/projects/${payload.projectId}`);
                  } catch (err) {
                    toast.error("Failed to start deployment", { id: "deploy" });
                  }
                }}
              >
                <Rocket size={14} />
                Deploy Now
              </Button>
            </div>
          </div>
        ),
        { duration: 15000 }
      );
    };

    socket.on("github_commit_pushed", handleCommitPushed);

    return () => {
      socket.off("github_commit_pushed", handleCommitPushed);
      socket.disconnect();
    };
  }, [session, router]);

  return <>{children}</>;
}
