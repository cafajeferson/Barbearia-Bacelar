"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Pause, Play, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setRecurringSeriesStatusAction } from "../actions";

export function SeriesMenuActions({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(status: "ACTIVE" | "PAUSED" | "CANCELLED", successMsg: string) {
    startTransition(async () => {
      try {
        await setRecurringSeriesStatusAction({ seriesId, status });
        toast.success(successMsg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro na ação.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" disabled={isPending}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run("PAUSED", "Série pausada.")}>
          <Pause className="h-4 w-4" /> Pausar série
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("ACTIVE", "Série reativada.")}>
          <Play className="h-4 w-4" /> Reativar série
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => run("CANCELLED", "Série cancelada.")}
        >
          <Ban className="h-4 w-4" /> Cancelar série
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
