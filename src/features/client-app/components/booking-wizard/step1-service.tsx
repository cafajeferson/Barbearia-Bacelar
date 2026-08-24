"use client";

import Image from "next/image";
import { Scissors } from "lucide-react";
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
  const hasSelection = selectedIds.length > 0;

  return (
    <div className={`space-y-4 p-4 ${hasSelection ? "pb-24" : ""}`}>
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
            <div className="flex items-center gap-3">
              {s.imageUrl ? (
                <Image
                  src={s.imageUrl}
                  alt={s.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <Scissors className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.durationMinutes} min</p>
              </div>
            </div>
            <span className="font-semibold">{formatBRL(s.price)}</span>
          </button>
        ))}
      </div>

      {/* Fixa acima da barra de navegação inferior (~4rem + safe-area) assim
          que o cliente escolhe algo — antes disso ele tinha que rolar até o
          fim da lista pra achar o botão, que nem sempre cabia na tela. */}
      {hasSelection && (
        <div
          className="fixed inset-x-0 z-20 mx-auto max-w-3xl border-t bg-background/95 p-4 backdrop-blur"
          style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          <Button className="w-full" onClick={onContinue}>
            Continuar
          </Button>
        </div>
      )}
    </div>
  );
}
