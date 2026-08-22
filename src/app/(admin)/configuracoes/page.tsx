import { JobTriggerPanel } from "@/features/automations/components/job-trigger-panel";

export default function ConfiguracoesPage() {
  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-muted-foreground">
          Unidades, Regras do Sistema, Identidade Visual, WhatsApp e Permissões chegam em uma
          próxima fase — por enquanto, Automações.
        </p>
      </div>

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
