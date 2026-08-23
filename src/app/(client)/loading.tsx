import { Skeleton } from "@/components/ui/skeleton";

/** Ver comentário em (admin)/loading.tsx — mesma ideia, pro app do cliente. */
export default function ClientLoading() {
  return (
    <div className="space-y-4 p-4 pb-28">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-28 rounded-lg" />
      <Skeleton className="h-28 rounded-lg" />
      <Skeleton className="h-28 rounded-lg" />
    </div>
  );
}
