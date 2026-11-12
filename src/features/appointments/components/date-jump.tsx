"use client";

import { useRouter } from "next/navigation";
import { CalendarSearch } from "lucide-react";

/**
 * Pula direto para um dia (ou mês/ano, na visão Mês) da agenda — sem ficar
 * clicando nas setas dia a dia. Usa o seletor nativo do celular/navegador.
 */
export function DateJump({
  basePath,
  view,
  dateISO,
  mode,
}: {
  basePath: string;
  /** valor do parâmetro view mantido na navegação (ex.: "dia", "semana", "mes") */
  view: string;
  dateISO: string;
  mode: "day" | "month";
}) {
  const router = useRouter();
  return (
    <label className="relative flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-accent">
      <CalendarSearch className="h-4 w-4 text-muted-foreground" />
      <span className="sr-only">{mode === "month" ? "Escolher mês e ano" : "Escolher dia"}</span>
      <input
        type={mode === "month" ? "month" : "date"}
        value={mode === "month" ? dateISO.slice(0, 7) : dateISO}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const iso = mode === "month" ? `${v}-01` : v;
          router.push(`${basePath}?view=${view}&date=${iso}`);
        }}
        className="w-[8.5rem] bg-transparent text-sm outline-none [color-scheme:dark]"
      />
    </label>
  );
}
