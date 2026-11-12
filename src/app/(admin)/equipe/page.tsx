import { getAuthContext, getCurrentUserName } from "@/server/auth/getAuthContext";
import { listProfessionals } from "@/features/professionals/service";
import { withAppContext } from "@/server/db/context";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchBox } from "@/shared/components/search-box";
import { ProfessionalFormDialog } from "@/features/professionals/components/professional-form-dialog";
import { WeeklyAvailabilityToggles } from "@/features/professionals/components/weekly-availability-toggles";
import { AdminAccessButton } from "@/features/professionals/components/admin-access-button";
import { OwnProfessionalButton } from "@/features/professionals/components/own-professional-button";

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
  const hasOwnProfile = professionals.some((p) => p.userId === ctx.sessionUserId);
  const myName = hasOwnProfile ? "" : ((await getCurrentUserName()) ?? "");

  return (
    <main className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Equipe</h1>
          <p className="text-muted-foreground">{professionals.length} profissionais</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasOwnProfile && <OwnProfessionalButton defaultName={myName} unitId={unit.id} />}
          <ProfessionalFormDialog unitId={unit.id} />
        </div>
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
              <TableHead className="w-20" />
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
                  <div className="flex items-center gap-1">
                    <AdminAccessButton professionalId={p.id} name={p.name} isAdmin={p.user.role === "ADMIN"} />
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
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
