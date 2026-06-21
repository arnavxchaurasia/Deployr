import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BillingSettings() {
  return (
    <Card className="p-8 rounded-2xl max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">Billing</h2>
      <p className="text-sm text-zinc-500">
        You are currently on the Free plan.
      </p>
      <Button disabled>
        Upgrade (coming soon)
      </Button>
    </Card>
  );
}
