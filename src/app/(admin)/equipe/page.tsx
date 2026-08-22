import { getAuthContext } from "@/server/auth/getAuthContext";
import { listProfessionals } from "@/features/professionals/service";
import { withAppContext } from "@/server/db/context";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchBox } from "@/shared/components/search-box";
import { ProfessionalFormDialog } from "@/features/professionals/components/professional-form-dialog";
import { WeeklyAvailabilityToggles } from "@/features/professionals/components/weekly-availability-toggles";

export default async function EquipePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { search } = await searchParams;

  const [professionals, unit] = await Promise.all([
    listProfessionals({ ctx, search }),
    withAppContext(ctx, (tx) => tx.unit.findFirstOrThrow()),
  ]);

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Equipe</h1>
          <p className="text-muted-foreground">{professionals.length} profissionais</p>
        </div>
        <ProfessionalFormDialog unitId={unit.id} />
      </div>

      <SearchBox placeholder="Buscar profissional" />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Comissão</TableHead>
              <TableHead>Unidade(s)</TableHead>
              <TableHead>Disponibilidade</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {professionals.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                    <Badge variant="outline" className="text-xs">
                      {p.user.role === "ADMIN" ? "Admin" : "Profissional"}
                    </Badge>
                    {!p.active && (
                      <Badge variant="destructive" className="text-xs">
                        Inativo
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{p.user.phone ?? "—"}</TableCell>
                <TableCell>
                  {p.commissionServicePct != null ? `${p.commissionServicePct}%` : "Padrão"}
                </TableCell>
                <TableCell>{p.units.map((u) => u.unit.name).join(", ")}</TableCell>
                <TableCell>
                  <WeeklyAvailabilityToggles
                    professionalId={p.id}
                    active={new Set(p.weeklyAvailability.filter((w) => w.active).map((w) => w.weekday))}
                  />
                </TableCell>
                <TableCell>
                  <ProfessionalFormDialog
                    professional={{
                      id: p.id,
                      name: p.name,
                      title: p.title,
                      color: p.color,
                      commissionServicePct:
                        p.commissionServicePct != null ? Number(p.commissionServicePct) : null,
                    }}
                    unitId={unit.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
