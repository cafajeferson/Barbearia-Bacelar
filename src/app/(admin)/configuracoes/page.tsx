import { getAuthContext } from "@/server/auth/getAuthContext";
import { getSystemSettings } from "@/features/settings/service";
import { SystemSettingsForm } from "@/features/settings/components/system-settings-form";
import { JobTriggerPanel } from "@/features/automations/components/job-trigger-panel";
import { listUnits } from "@/features/units/service";
import { UnitFormDialog } from "@/features/units/components/unit-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function ConfiguracoesPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const [settings, units] = await Promise.all([getSystemSettings({ ctx }), listUnits({ ctx })]);

  return (
    <main className="space-y-8 p-3 sm:p-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Unidades</h2>
            <p className="text-sm text-muted-foreground">Gerencie as unidades da barbearia</p>
          </div>
          <UnitFormDialog />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {units.map((u) => (
            <Card key={u.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {u.name}
                  <Badge variant={u.active ? "default" : "secondary"}>{u.active ? "Ativa" : "Desativada"}</Badge>
                </p>
                <p className="truncate text-sm text-muted-foreground">{u.address}</p>
                <p className="text-xs text-muted-foreground">
                  {u.phone ? `${u.phone} · ` : ""}
                  {u._count.professionals} profissional(is)
                </p>
              </div>
              <UnitFormDialog unit={{ id: u.id, name: u.name, address: u.address, phone: u.phone, active: u.active }} />
            </Card>
          ))}
        </div>
      </section>

      <SystemSettingsForm
        initial={{
          noShowThreshold: settings.noShowThreshold,
          noShowAction: settings.noShowAction,
          bookingMinLeadMinutes: settings.bookingMinLeadMinutes,
          bookingMaxLeadDays: settings.bookingMaxLeadDays,
          defaultCommissionServicePct: Number(settings.defaultCommissionServicePct),
          defaultCommissionWalkInPct: Number(settings.defaultCommissionWalkInPct),
          defaultCommissionProductPct: Number(settings.defaultCommissionProductPct),
          subscriptionGraceDays: settings.subscriptionGraceDays,
        }}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Automações</h2>
        <p className="text-sm text-muted-foreground">
          Cada automação também roda sozinha (via <code>scripts/run-jobs.ts</code>), mas você
          sempre pode disparar manualmente aqui — nenhuma automação aqui é uma prisão.
        </p>
        <JobTriggerPanel />
      </section>
    </main>
  );
}
