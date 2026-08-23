"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw, CalendarDays, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botão de atualizar + toggle Dia/Mês da Agenda Mestre — só a visão de Dia funciona por enquanto, Mês vem numa próxima etapa. */
export function AgendaToolbar() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Atualizar">
        <RotateCw className="h-4 w-4" />
      </Button>
      <div className="flex overflow-hidden rounded-md border">
        <Button variant="default" size="sm" className="rounded-none">
          <CalendarDays className="mr-1 h-4 w-4" /> Dia
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-none"
          onClick={() => toast.info("Visão de Mês chega em uma próxima atualização.")}
        >
          <CalendarRange className="mr-1 h-4 w-4" /> Mês
        </Button>
      </div>
    </div>
  );
}
