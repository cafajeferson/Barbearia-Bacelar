"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { listSubscriptionPlansAction } from "../actions";
import { PlanFormDialog } from "./plan-form-dialog";
import { formatBRL } from "@/shared/lib/format";

type Plan = Awaited<ReturnType<typeof listSubscriptionPlansAction>>[number];

export function ManagePlansDialog() {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    if (open) listSubscriptionPlansAction().then(setPlans);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Settings className="mr-1 h-4 w-4" /> Gerenciar Planos
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-md space-y-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Planos de assinatura</SheetTitle>
        </SheetHeader>
        <PlanFormDialog />
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{plan.name}</p>
                <PlanFormDialog
                  plan={{
                    id: plan.id,
                    name: plan.name,
                    priceMonthly: Number(plan.priceMonthly),
                    creditLimitPerMonth: plan.creditLimitPerMonth,
                    services: plan.services,
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {plan.services.map((s) => s.service.name).join(" + ")}
              </p>
              <p className="mt-1 text-sm">
                {formatBRL(Number(plan.priceMonthly))}/mês · {plan.creditLimitPerMonth} créditos
              </p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
