"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelAppointmentAction } from "@/features/appointments/actions";

export function CancelAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    if (!confirm("Cancelar este agendamento?")) return;
    startTransition(async () => {
      try {
        await cancelAppointmentAction({ appointmentId });
        toast.success("Agendamento cancelado.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao cancelar.");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
      {isPending ? "Cancelando..." : "Cancelar"}
    </Button>
  );
}
