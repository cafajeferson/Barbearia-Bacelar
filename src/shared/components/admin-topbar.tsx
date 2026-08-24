"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const PERIOD_LABEL: Record<string, string> = {
  all: "Todos os meses",
  prev: "Mês passado",
  current: "Mês atual",
  next: "Próximo mês",
};

export function AdminTopbar({ units }: { units: { id: string; name: string; address: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = searchParams.get("period") ?? "all";
  const unit = searchParams.get("unit") ?? "all";

  function updateParam(key: string, value: string, extraDeletes: string[] = []) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    for (const k of extraDeletes) params.delete(k);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2 border-b bg-background/95 px-6 py-3 backdrop-blur">
      <Select value={period} onValueChange={(v) => updateParam("period", v, ["date", "view"])}>
        <SelectTrigger className="w-auto gap-2 rounded-full border-none bg-secondary px-3 py-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Período ·</span>
            <span className="font-medium">{PERIOD_LABEL[period]}</span>
          </span>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PERIOD_LABEL).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={unit} onValueChange={(v) => updateParam("unit", v)}>
        <SelectTrigger className="w-auto gap-2 rounded-full border-none bg-secondary px-3 py-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Unidade ·</span>
            <span className="font-medium">
              {unit === "all" ? "Todas" : (units.find((u) => u.id === unit)?.address ?? "Todas")}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as unidades</SelectItem>
          {units.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.address}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
