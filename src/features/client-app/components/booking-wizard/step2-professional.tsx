"use client";

import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initials } from "@/shared/lib/format";
import type { WizardProfessional } from "./types";

export function Step2Professional({
  professionals,
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  professionals: WizardProfessional[];
  selected: string | "ANY" | null;
  onSelect: (id: string | "ANY") => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Escolha o profissional</h1>
      <button
        onClick={() => onSelect("ANY")}
        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${
          selected === "ANY" ? "border-primary bg-primary/10" : ""
        }`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium">Qualquer Profissional</p>
          <p className="text-xs text-muted-foreground">Primeiro disponível no horário escolhido</p>
        </div>
      </button>

      {professionals.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${
            selected === p.id ? "border-primary bg-primary/10" : ""
          }`}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-white"
            style={{ backgroundColor: p.color }}
          >
            {initials(p.name)}
          </div>
          <div>
            <p className="font-medium">{p.name}</p>
            {p.title && <p className="text-xs text-muted-foreground">{p.title}</p>}
          </div>
        </button>
      ))}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1" disabled={!selected} onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
