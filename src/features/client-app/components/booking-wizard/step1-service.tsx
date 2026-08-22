"use client";

import { Button } from "@/components/ui/button";
import { formatBRL } from "@/shared/lib/format";
import type { WizardService } from "./types";

export function Step1Service({
  services,
  selectedIds,
  onToggle,
  onContinue,
}: {
  services: WizardService[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Escolha o serviço</h1>
      <div className="space-y-2">
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => onToggle(s.id)}
            className={`flex w-full items-center justify-between rounded-lg border p-3 text-left ${
              selectedIds.includes(s.id) ? "border-primary bg-primary/10" : ""
            }`}
          >
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.durationMinutes} min</p>
            </div>
            <span className="font-semibold">{formatBRL(s.price)}</span>
          </button>
        ))}
      </div>
      <Button className="w-full" disabled={selectedIds.length === 0} onClick={onContinue}>
        Continuar
      </Button>
    </div>
  );
}
