import { getAuthContext } from "@/server/auth/getAuthContext";
import { getSystemSettings } from "@/features/settings/service";
import { SystemSettingsForm } from "@/features/settings/components/system-settings-form";
import { JobTriggerPanel } from "@/features/automations/components/job-trigger-panel";

export default async function ConfiguracoesPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const settings = await getSystemSettings({ ctx });

  return (
    <main className="space-y-8 p-6">
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
