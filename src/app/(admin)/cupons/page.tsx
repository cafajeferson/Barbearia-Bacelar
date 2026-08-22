import Link from "next/link";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listCoupons } from "@/features/coupons/service";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CouponFormDialog } from "@/features/coupons/components/coupon-form-dialog";
import { CouponActions, CopyCodeButton } from "@/features/coupons/components/coupon-actions";
import { GenerateRetentionButton } from "@/features/coupons/components/generate-retention-button";
import { formatBRL } from "@/shared/lib/format";
import { cn } from "@/lib/utils";

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<{ onlyActive?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { onlyActive } = await searchParams;
  const filterActive = onlyActive === "1";

  const coupons = await listCoupons({ ctx, onlyActive: filterActive });

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cupons</h1>
          <p className="text-muted-foreground">{coupons.length} cupons</p>
        </div>
        <div className="flex gap-2">
          <GenerateRetentionButton />
          <CouponFormDialog />
        </div>
      </div>

      <Link
        href={`/cupons?onlyActive=${filterActive ? "" : "1"}`}
        className={cn(
          "inline-block w-fit rounded-full border px-3 py-1 text-xs",
          filterActive ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
        )}
      >
        Somente ativos
      </Link>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <CopyCodeButton code={c.code} />
                  {c.type === "AUTO_RETENTION" && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Retorno
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {c.name}
                  {c.client && <p className="text-xs text-muted-foreground">{c.client.name}</p>}
                </TableCell>
                <TableCell>
                  {c.discountType === "PERCENT" ? `${c.discountValue}%` : formatBRL(Number(c.discountValue))}
                </TableCell>
                <TableCell>{new Intl.DateTimeFormat("pt-BR").format(c.validUntil)}</TableCell>
                <TableCell>
                  {c.usageCount}/{c.usageLimit}
                </TableCell>
                <TableCell>
                  <Badge variant={c.status === "ACTIVE" ? "default" : "outline"}>{c.status}</Badge>
                </TableCell>
                <TableCell>
                  <CouponActions couponId={c.id} status={c.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
