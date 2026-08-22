import Link from "next/link";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listClients } from "@/features/clients/service";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchBox } from "@/shared/components/search-box";
import { ClientFormDialog } from "@/features/clients/components/client-form-dialog";
import { formatBRL } from "@/shared/lib/format";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "SUBSCRIBERS", label: "Assinantes" },
  { key: "WITH_NO_SHOWS", label: "Com no-shows" },
  { key: "BLOCKED", label: "Bloqueados" },
] as const;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; filter?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { search, filter } = await searchParams;

  const clients = await listClients({
    ctx,
    search,
    filter: filter as "SUBSCRIBERS" | "WITH_NO_SHOWS" | "BLOCKED" | undefined,
  });

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-muted-foreground">{clients.length} cadastrados</p>
        </div>
        <ClientFormDialog />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Buscar por nome ou telefone" />
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/clientes?${new URLSearchParams({ ...(search ? { search } : {}), filter: filter === f.key ? "" : f.key }).toString()}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              filter === f.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Histórico</TableHead>
              <TableHead>Receita total</TableHead>
              <TableHead>Último atendimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {c.name}
                    {c.isWalkIn && (
                      <Badge variant="outline" className="text-xs">
                        Walk-in
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{c.phone ?? "—"}</TableCell>
                <TableCell>
                  {c._count.appointments} atendimentos
                  {c.noShowCount > 0 && (
                    <span className="ml-1 text-destructive">· {c.noShowCount} no-show(s)</span>
                  )}
                </TableCell>
                <TableCell>{formatBRL(c.revenueTotal)}</TableCell>
                <TableCell>
                  {c.lastAppointmentDate
                    ? new Intl.DateTimeFormat("pt-BR").format(c.lastAppointmentDate)
                    : "—"}
                </TableCell>
                <TableCell>
                  {c.blocked ? (
                    <Badge variant="destructive">Bloqueado</Badge>
                  ) : c.subscriptions.length > 0 ? (
                    <Badge className="bg-primary/15 text-primary">Assinante</Badge>
                  ) : (
                    <Badge variant="outline">Ativo</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <ClientFormDialog client={c} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
