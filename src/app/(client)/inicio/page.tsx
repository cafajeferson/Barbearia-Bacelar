import { getAuthContext } from "@/server/auth/getAuthContext";
import { listCatalog } from "@/features/catalog/service";
import { getRecentServices } from "@/features/client-app/service";
import { HomeCatalog } from "@/features/client-app/components/home-catalog";

export default async function InicioPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const [rawSections, recentServices] = await Promise.all([
    listCatalog({ ctx, onlyActive: true }),
    getRecentServices({ ctx }),
  ]);

  // Decimal do Prisma não é serializável na fronteira Server -> Client
  // Component — precisa virar number aqui antes de cruzar pra HomeCatalog.
  const sections = rawSections.map((section) => ({
    ...section,
    services: section.services.map((service) => ({ ...service, price: Number(service.price) })),
  }));

  return <HomeCatalog sections={sections} recentServices={recentServices} />;
}
