import Image from "next/image";
import { Star, Scissors } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listCatalog } from "@/features/catalog/service";
import { Badge } from "@/components/ui/badge";
import { SectionFormDialog } from "@/features/catalog/components/section-form-dialog";
import { ServiceFormDialog } from "@/features/catalog/components/service-form-dialog";
import { SectionActions } from "@/features/catalog/components/section-actions";
import { ServiceDeleteButton } from "@/features/catalog/components/service-delete-button";
import { formatBRL } from "@/shared/lib/format";

export default async function CatalogoPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const sections = await listCatalog({ ctx });

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo</h1>
          <p className="text-muted-foreground">{sections.length} seções</p>
        </div>
        <SectionFormDialog />
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.id} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{section.name}</h2>
                <Badge variant="outline">{section.services.length} serviços</Badge>
              </div>
              <div className="flex items-center gap-3">
                <ServiceFormDialog sectionId={section.id} />
                <SectionActions sectionId={section.id} active={section.active} />
              </div>
            </div>
            <div className="divide-y">
              {section.services.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhum serviço nesta seção.</p>
              ) : (
                section.services.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {s.imageUrl ? (
                        <Image
                          src={s.imageUrl}
                          alt={s.name}
                          width={36}
                          height={36}
                          className="h-9 w-9 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                          <Scissors className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      {s.featured && <Star className="h-4 w-4 shrink-0 fill-primary text-primary" />}
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {s.name}{" "}
                          {s.genderTag && (
                            <span className="text-xs text-muted-foreground">({s.genderTag})</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.durationMinutes} min</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatBRL(Number(s.price))}</span>
                      <ServiceFormDialog
                        sectionId={section.id}
                        service={{ ...s, price: Number(s.price) }}
                      />
                      <ServiceDeleteButton serviceId={s.id} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
