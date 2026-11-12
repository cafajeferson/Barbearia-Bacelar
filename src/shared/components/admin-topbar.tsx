"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "YYYY-MM" -> "nov 2026", igual ao formato do outro app. */
function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${MONTH_ABBR[month - 1]} ${year}`;
}

/** Próximos 3 meses + os últimos 8, mais recente primeiro — mesma janela do outro app. */
function buildMonthOptions() {
  const today = new Date();
  const options: string[] = [];
  for (let offset = 3; offset >= -8; offset--) {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return options;
}

export function AdminTopbar({
  units,
  leading,
}: {
  units: { id: string; name: string; address: string }[];
  /** Botão do menu no celular (AdminMobileNav) — fica à esquerda dos filtros. */
  leading?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Relatórios têm controles de período próprios (periodo/data/de/ate): lá o
  // rótulo do topo acompanha o mês que o relatório está mostrando.
  const isReports = pathname.startsWith("/relatorios");
  const reportMonth =
    isReports && (searchParams.get("periodo") ?? "mes") === "mes" ? (searchParams.get("data") ?? "").slice(0, 7) : "";
  const period = searchParams.get("period") ?? (/^\d{4}-\d{2}$/.test(reportMonth) ? reportMonth : "all");
  const unit = searchParams.get("unit") ?? "all";
  const monthOptions = useMemo(buildMonthOptions, []);

  function updateParam(key: string, value: string, extraDeletes: string[] = []) {
    const params = new URLSearchParams(searchParams.toString());
    // Nos Relatórios, escolher um mês no topo = relatório "Mês" daquele mês
    // (aba Clientes usa de/ate: o mês inteiro).
    if (isReports && key === "period" && /^\d{4}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      params.set("periodo", "mes");
      params.set("data", `${value}-01`);
      params.set("de", `${value}-01`);
      params.set("ate", `${value}-${String(last).padStart(2, "0")}`);
    }
    if (value === "all") params.delete(key);
    else params.set(key, value);
    for (const k of extraDeletes) params.delete(k);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 overflow-x-auto border-b bg-background/95 px-3 py-3 backdrop-blur lg:px-6 print:hidden">
      {leading}
      <Select value={period} onValueChange={(v) => updateParam("period", v, ["date", "view"])}>
        <SelectTrigger className="w-auto shrink-0 gap-2 whitespace-nowrap rounded-full border-none bg-secondary px-3 py-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Período ·</span>
            <span className="font-medium">{period === "all" ? "Todos os meses" : monthLabel(period)}</span>
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-64">
          <SelectItem value="all">Todos os meses</SelectItem>
          {monthOptions.map((m) => (
            <SelectItem key={m} value={m}>
              {monthLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={unit} onValueChange={(v) => updateParam("unit", v)}>
        <SelectTrigger className="w-auto shrink-0 gap-2 whitespace-nowrap rounded-full border-none bg-secondary px-3 py-1.5 text-xs">
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
