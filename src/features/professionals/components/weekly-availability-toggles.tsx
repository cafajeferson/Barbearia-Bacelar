"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setWeeklyAvailabilityAction } from "../actions";

const WEEKDAYS = [
  { weekday: 1, label: "S" },
  { weekday: 2, label: "T" },
  { weekday: 3, label: "Q" },
  { weekday: 4, label: "Q" },
  { weekday: 5, label: "S" },
  { weekday: 6, label: "S" },
  { weekday: 0, label: "D" },
];

export function WeeklyAvailabilityToggles({
  professionalId,
  active,
}: {
  professionalId: string;
  active: Set<number>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle(weekday: number) {
    startTransition(async () => {
      try {
        await setWeeklyAvailabilityAction({
          professionalId,
          weekday,
          active: !active.has(weekday),
        });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar disponibilidade.");
      }
    });
  }

  return (
    <div className="flex gap-1">
      {WEEKDAYS.map(({ weekday, label }) => (
        <button
          key={weekday}
          disabled={isPending}
          onClick={() => toggle(weekday)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors",
            active.has(weekday)
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
