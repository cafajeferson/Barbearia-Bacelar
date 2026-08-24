"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botão de atualizar da Agenda Mestre — o toggle Dia/Mês vive na própria page.tsx. */
export function AgendaToolbar() {
  const router = useRouter();

  return (
    <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Atualizar">
      <RotateCw className="h-4 w-4" />
    </Button>
  );
}
