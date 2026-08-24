"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { updateServiceCommissionAction } from "../actions";

type Service = {
  id: string;
  name: string;
  commissionServicePct: number | string | null;
  commissionWalkInPct: number | string | null;
};
type Section = { id: string; name: string; services: Service[] };

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function ServiceRow({
  service,
  defaultServicePct,
  defaultWalkInPct,
  view,
}: {
  service: Service;
  defaultServicePct: number;
  defaultWalkInPct: number;
  view: "PROFISSIONAL" | "BARBEARIA";
}) {
  const [servicePct, setServicePct] = useState(
    service.commissionServicePct != null ? Number(service.commissionServicePct) : defaultServicePct,
  );
  const [walkInPct, setWalkInPct] = useState(
    service.commissionWalkInPct != null ? Number(service.commissionWalkInPct) : defaultWalkInPct,
  );
  const [saving, setSaving] = useState(false);

  async function save(next: { servicePct: number; walkInPct: number }) {
    setSaving(true);
    try {
      await updateServiceCommissionAction({
        serviceId: service.id,
        commissionServicePct: next.servicePct,
        commissionWalkInPct: next.walkInPct,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar comissão.");
    } finally {
      setSaving(false);
    }
  }

  // No toggle "Barbearia" o campo edita o % da barbearia — internamente
  // sempre guardamos o % do PROFISSIONAL (é o que o schema/apuração usa).
  function toProfessionalPct(displayValue: number) {
    return view === "BARBEARIA" ? 100 - displayValue : displayValue;
  }
  function toDisplayValue(professionalPct: number) {
    return view === "BARBEARIA" ? 100 - professionalPct : professionalPct;
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate font-medium">{service.name}</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-muted-foreground">AGENDADO</span>
          <Bar pct={servicePct} />
          <span className="w-12 shrink-0 text-muted-foreground">
            {Math.round(servicePct)}/{Math.round(100 - servicePct)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-muted-foreground">WALK-IN</span>
          <Bar pct={walkInPct} />
          <span className="w-12 shrink-0 text-muted-foreground">
            {Math.round(walkInPct)}/{Math.round(100 - walkInPct)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="space-y-1 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Agendado</p>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              className="h-8 w-16 text-center"
              disabled={saving}
              value={Math.round(toDisplayValue(servicePct))}
              onChange={(e) => {
                const displayValue = Number(e.target.value);
                const next = toProfessionalPct(displayValue);
                setServicePct(next);
              }}
              onBlur={() => save({ servicePct, walkInPct })}
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Walk-in</p>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              className="h-8 w-16 text-center"
              disabled={saving}
              value={Math.round(toDisplayValue(walkInPct))}
              onChange={(e) => {
                const displayValue = Number(e.target.value);
                const next = toProfessionalPct(displayValue);
                setWalkInPct(next);
              }}
              onBlur={() => save({ servicePct, walkInPct })}
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ServiceCommissionConfig({
  sections,
  defaultServicePct,
  defaultWalkInPct,
}: {
  sections: Section[];
  defaultServicePct: number;
  defaultWalkInPct: number;
}) {
  const [view, setView] = useState<"PROFISSIONAL" | "BARBEARIA">("PROFISSIONAL");
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, services: s.services.filter((sv) => sv.name.toLowerCase().includes(q)) }))
      .filter((s) => s.services.length > 0);
  }, [sections, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border p-0.5">
          <button
            type="button"
            onClick={() => setView("PROFISSIONAL")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              view === "PROFISSIONAL" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Profissional
          </button>
          <button
            type="button"
            onClick={() => setView("BARBEARIA")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              view === "BARBEARIA" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            Barbearia
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar serviço..."
            className="w-64 pl-8"
          />
        </div>
      </div>

      {filteredSections.map((section) => (
        <Card key={section.id} className="overflow-hidden p-0">
          <div className="border-b bg-card px-4 py-3">
            <h2 className="font-semibold">Comissões por Serviço — {section.name}</h2>
            <p className="text-xs text-muted-foreground">
              Cada serviço pode ter percentuais diferentes. Walk-in costuma ter comissão menor pois o cliente
              não escolheu o profissional.
            </p>
          </div>
          <div>
            {section.services.map((sv) => (
              <ServiceRow
                key={sv.id}
                service={sv}
                defaultServicePct={defaultServicePct}
                defaultWalkInPct={defaultWalkInPct}
                view={view}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
