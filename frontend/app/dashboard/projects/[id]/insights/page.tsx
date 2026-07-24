"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Sparkles, CheckCircle2, AlertTriangle, Info } from "lucide-react";

type Insight = {
  id: string;
  ruleCode: string;
  title: string;
  explanation: string;
  recommendation: string;
  severity: "high" | "medium" | "low";
  impact: string;
  confidence: number;
};

export default function InsightsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await api.get(`/project/${id}/insights`);
      setInsights(res.data.insights || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) return <div className="p-10 flex gap-2"><Loader2 className="animate-spin" /> Analyzing Project...</div>;

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${id}`)}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="text-purple-500" /> Build Recommendations
          </h1>
          <p className="text-zinc-500 mt-1">Automated checks based on your project's dependencies and build output.</p>
        </div>
      </div>

      {insights.length === 0 ? (
        <Card className="p-10 text-center flex flex-col items-center justify-center border-dashed">
          <CheckCircle2 size={48} className="text-emerald-500 mb-4" />
          <h3 className="text-xl font-semibold">Your codebase is pristine!</h3>
          <p className="text-zinc-500 mt-2 max-w-md">
            Our AI engine could not find any critical optimizations or anti-patterns in your latest deployment. Keep up the great work!
          </p>
        </Card>
      ) : (
        <div className="grid gap-6">
          {insights.map(insight => (
            <Card key={insight.id} className="p-6 relative overflow-hidden border-l-4" style={{ 
              borderLeftColor: insight.severity === "high" ? "#ef4444" : insight.severity === "medium" ? "#f59e0b" : "#3b82f6" 
            }}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  {insight.severity === "high" && <AlertTriangle className="text-red-500" size={20} />}
                  {insight.severity === "medium" && <AlertTriangle className="text-amber-500" size={20} />}
                  {insight.severity === "low" && <Info className="text-blue-500" size={20} />}
                  <h3 className="text-lg font-semibold">{insight.title}</h3>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-full font-medium">
                    Impact: {insight.impact}
                  </span>
                  <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full font-medium">
                    {Math.round(insight.confidence * 100)}% Confidence
                  </span>
                </div>
              </div>

              <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
                <p>{insight.explanation}</p>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-md border">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">Recommendation:</p>
                  <p className="font-mono text-xs">{insight.recommendation}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
