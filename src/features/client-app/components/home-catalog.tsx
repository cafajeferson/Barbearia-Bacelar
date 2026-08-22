"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/shared/lib/format";
import type { getRecentServicesAction } from "../actions";

// price já vem como number (não Decimal) — Decimal não atravessa a fronteira
// Server -> Client Component, precisa ser convertido antes (ver inicio/page.tsx).
type ServiceView = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  imageUrl: string | null;
  genderTag: string | null;
  featured: boolean;
  active: boolean;
};
type SectionView = { id: string; name: string; active: boolean; services: ServiceView[] };
type Sections = SectionView[];
type RecentServices = Awaited<ReturnType<typeof getRecentServicesAction>>;

const CATEGORIES = ["Todos", "Masculino", "Feminino"] as const;

function matchesCategory(genderTag: string | null, category: (typeof CATEGORIES)[number]) {
  if (category === "Todos") return true;
  if (category === "Masculino") return genderTag === "M" || !genderTag;
  return genderTag === "F" || !genderTag;
}

export function HomeCatalog({ sections, recentServices }: { sections: Sections; recentServices: RecentServices }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Todos");

  const featured = sections.flatMap((s) => s.services.filter((sv) => sv.featured && matchesCategory(sv.genderTag, category)));

  return (
    <div className="space-y-8 p-4">
      {recentServices.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <RotateCcw className="h-4 w-4 text-primary" /> Agendar Novamente
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recentServices.map((s) => (
              <Link
                key={s.id}
                href={`/agendar?serviceId=${s.id}`}
                className="flex w-40 shrink-0 items-center gap-2 rounded-lg border bg-card p-2"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-secondary text-xs">
                  {s.imageUrl ? (
                    <Image src={s.imageUrl} alt={s.name} width={40} height={40} className="rounded object-cover" />
                  ) : (
                    "✂"
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatBRL(s.price)} · {s.durationMinutes}min
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              category === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {featured.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Star className="h-4 w-4 text-primary" /> Destaques
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {featured.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
        </section>
      )}

      {sections
        .filter((sec) => sec.active && sec.services.some((sv) => matchesCategory(sv.genderTag, category)))
        .map((sec) => (
          <section key={sec.id}>
            <h2 className="mb-2 font-semibold">{sec.name}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sec.services
                .filter((sv) => sv.active && matchesCategory(sv.genderTag, category))
                .map((sv) => (
                  <ServiceCard key={sv.id} service={sv} />
                ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function ServiceCard({ service }: { service: Sections[number]["services"][number] }) {
  return (
    <div className="flex gap-3 rounded-lg border bg-card p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-secondary text-2xl">
        {service.imageUrl ? (
          <Image src={service.imageUrl} alt={service.name} width={64} height={64} className="rounded object-cover" />
        ) : (
          "✂"
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate font-medium">{service.name}</p>
          {service.featured && <Badge className="bg-primary/15 text-[10px] text-primary">Destaque</Badge>}
        </div>
        {service.description && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{service.description}</p>
        )}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm font-semibold">
            {formatBRL(Number(service.price))} · {service.durationMinutes}min
          </span>
          <Button size="sm" asChild>
            <Link href={`/agendar?serviceId=${service.id}`}>Agendar</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
