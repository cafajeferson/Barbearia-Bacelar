"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { transitionAppointmentStatusAction } from "@/features/appointments/actions";
import type { AppointmentStatus } from "@/generated/prisma/enums";

const NEXT_STEP: Partial<Record<AppointmentStatus, { label: string; to: AppointmentStatus }>> = {
  SCHEDULED: { label: "Confirmar", to: "CONFIRMED" },
  CONFIRMED: { label: "Iniciar atendimento", to: "IN_PROGRESS" },
  IN_PROGRESS: { label: "Concluir", to: "COMPLETED" },
};

export function AppointmentStatusActions({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next = NEXT_STEP[status];

  function transition(toStatus: AppointmentStatus) {
    startTransition(async () => {
      try {
        await transitionAppointmentStatusAction({ appointmentId, toStatus });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar status.");
      }
    });
  }

  if (!next) return null;

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" disabled={isPending} onClick={() => transition(next.to)}>
        {next.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" disabled={isPending}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => transition("NO_SHOW")}>Não compareceu</DropdownMenuItem>
          <DropdownMenuItem onClick={() => transition("CANCELLED")}>Cancelar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
