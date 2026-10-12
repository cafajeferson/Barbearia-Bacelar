import { getAuthContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { ttlCached } from "@/server/db/ttl-cache";
import { listCatalog } from "@/features/catalog/service";
import { listActiveProfessionalsForBooking } from "@/features/professionals/service";
import { getOwnSubscriptions } from "@/features/subscriptions/service";
import { listProducts } from "@/features/inventory/service";
import { BookingWizard } from "@/features/client-app/components/booking-wizard";

export default async function AgendarPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { serviceId } = await searchParams;

  // Unidade + janela de cancelamento numa transação só e com 60s de cache:
  // eram duas transações próprias, o que levava esta página a 6 em paralelo
  // contra um pool de 5 conexões — a sexta esperava uma das outras terminar
  // e a tela de agendar custava o dobro do tempo de rede.
  const [sections, professionals, subscriptions, { unit, cancellationWindowHours }, products] = await Promise.all([
    listCatalog({ ctx, onlyActive: true }),
    listActiveProfessionalsForBooking({ ctx }),
    getOwnSubscriptions({ ctx }),
    ttlCached("agendar:unit-settings", 60_000, () =>
      withAppContext(ctx, async (tx) => {
        const unit = await tx.unit.findFirstOrThrow({ select: { id: true, name: true } });
        const settings = await tx.systemSettings.findUniqueOrThrow({
          where: { id: 1 },
          select: { cancellationWindowHours: true },
        });
        return { unit, cancellationWindowHours: settings.cancellationWindowHours };
      }),
    ),
    listProducts({ ctx }),
  ]);

  const services = sections.flatMap((s) =>
    s.services.map((sv) => ({
      id: sv.id,
      name: sv.name,
      price: Number(sv.price),
      durationMinutes: sv.durationMinutes,
      genderTag: sv.genderTag,
      imageUrl: sv.imageUrl,
    })),
  );

  return (
    <BookingWizard
      unitId={unit.id}
      unitName={unit.name}
      services={services}
      professionals={professionals}
      products={products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, price: Number(p.price), imageUrl: p.imageUrl }))}
      subscriptions={subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        creditsUsedThisPeriod: s.creditsUsedThisPeriod,
        plan: { name: s.plan.name, creditLimitPerMonth: s.plan.creditLimitPerMonth },
      }))}
      cancellationWindowHours={cancellationWindowHours}
      initialServiceId={serviceId}
    />
  );
}
