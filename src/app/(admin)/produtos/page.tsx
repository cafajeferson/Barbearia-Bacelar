import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listProducts, getInventorySummary } from "@/features/inventory/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchBox } from "@/shared/components/search-box";
import { ProductFormDialog } from "@/features/inventory/components/product-form-dialog";
import { formatBRL } from "@/shared/lib/format";
import { cn } from "@/lib/utils";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; inactive?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { search, inactive } = await searchParams;
  const includeInactive = inactive === "1";

  const [products, summary] = await Promise.all([
    listProducts({ ctx, search, includeInactive }),
    getInventorySummary({ ctx }),
  ]);

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-muted-foreground">Estoque e vendas de produtos</p>
        </div>
        <ProductFormDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total de Produtos</p>
          <p className="text-2xl font-semibold">{summary.totalProducts}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Valor em Estoque</p>
          <p className="text-2xl font-semibold">{formatBRL(summary.stockValue)}</p>
        </Card>
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm text-muted-foreground">Estoque Baixo</p>
            <p className="text-2xl font-semibold text-destructive">{summary.lowStockCount}</p>
          </div>
          {summary.lowStockCount > 0 && <AlertTriangle className="h-6 w-6 text-destructive" />}
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Buscar produto" />
        <Link
          href={`/produtos?${new URLSearchParams({ ...(search ? { search } : {}), inactive: includeInactive ? "" : "1" }).toString()}`}
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            includeInactive ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
          )}
        >
          Exibir inativos
        </Link>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead>Comissão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {p.imageUrl ? (
                      <Image
                        src={p.imageUrl}
                        alt={p.name}
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                        <PackageOpen className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{p.name}</p>
                      {(p.brand || p.category) && (
                        <p className="text-xs text-muted-foreground">
                          {[p.brand, p.category].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{formatBRL(Number(p.price))}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "flex items-center gap-1",
                      p.stock <= p.lowStockAlert && "text-destructive",
                    )}
                  >
                    {p.stock <= p.lowStockAlert && <AlertTriangle className="h-3.5 w-3.5" />}
                    {p.stock}
                  </span>
                </TableCell>
                <TableCell>{p.commissionPct != null ? `${p.commissionPct}%` : "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.active ? "outline" : "destructive"}>
                    {p.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ProductFormDialog
                    product={{
                      ...p,
                      price: Number(p.price),
                      commissionPct: p.commissionPct != null ? Number(p.commissionPct) : null,
                    }}
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
