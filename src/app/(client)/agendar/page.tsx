import { getAuthContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { listCatalog } from "@/features/catalog/service";
import { listActiveProfessionalsForBooking } from "@/features/professionals/service";
import { getOwnSubscriptions } from "@/features/subscriptions/service";
import { BookingWizard } from "@/features/client-app/components/booking-wizard";

export default async function AgendarPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { serviceId } = await searchParams;

  const [sections, professionals, subscriptions, unit, settings] = await Promise.all([
    listCatalog({ ctx, onlyActive: true }),
    listActiveProfessionalsForBooking({ ctx }),
    getOwnSubscriptions({ ctx }),
    withAppContext(ctx, (tx) => tx.unit.findFirstOrThrow()),
    withAppContext(ctx, (tx) => tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } })),
  ]);

  const services = sections.flatMap((s) =>
    s.services.map((sv) => ({
      id: sv.id,
      name: sv.name,
      price: Number(sv.price),
      durationMinutes: sv.durationMinutes,
      genderTag: sv.genderTag,
    })),
  );

  return (
    <BookingWizard
      unitId={unit.id}
      unitName={unit.name}
      services={services}
      professionals={professionals}
      subscriptions={subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        creditsUsedThisPeriod: s.creditsUsedThisPeriod,
        plan: { name: s.plan.name, creditLimitPerMonth: s.plan.creditLimitPerMonth },
      }))}
      cancellationWindowHours={settings.cancellationWindowHours}
      initialServiceId={serviceId}
    />
  );
}
