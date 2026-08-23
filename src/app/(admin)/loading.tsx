import { Skeleton } from "@/components/ui/skeleton";

/**
 * Next.js mostra isso IMEDIATAMENTE ao navegar pra qualquer página do admin,
 * enquanto os dados da página nova ainda carregam — sem isso a tela ficava
 * congelada/em branco por 1-2s a cada clique no menu, dando sensação de
 * travamento mesmo quando o app está funcionando normalmente.
 */
export default function AdminLoading() {
  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </main>
  );
}
