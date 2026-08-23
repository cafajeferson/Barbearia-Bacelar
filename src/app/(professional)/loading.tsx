import { Skeleton } from "@/components/ui/skeleton";

/** Ver comentário em (admin)/loading.tsx — mesma ideia, pro app do profissional. */
export default function ProfessionalLoading() {
  return (
    <main className="space-y-4 p-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </main>
  );
}
