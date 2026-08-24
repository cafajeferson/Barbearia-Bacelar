"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, RotateCw, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateSystemSettingsAction } from "../actions";
import { SYSTEM_SETTINGS_DEFAULTS } from "../constants";
import type { NoShowAction } from "@/generated/prisma/enums";

const NO_SHOW_ACTION_LABEL: Record<NoShowAction, string> = {
  NONE: "Nenhuma ação",
  REQUIRE_PREPAYMENT: "Exigir pagamento antecipado",
  BLOCK_ONLINE_BOOKING: "Bloquear agendamento online",
};

type Settings = {
  noShowThreshold: number;
  noShowAction: NoShowAction;
  bookingMinLeadMinutes: number;
  bookingMaxLeadDays: number;
  defaultCommissionServicePct: number;
  defaultCommissionWalkInPct: number;
  defaultCommissionProductPct: number;
  subscriptionGraceDays: number;
};

export function SystemSettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [values, setValues] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateSystemSettingsAction(values);
      toast.success("Regras salvas.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function handleRestoreDefaults() {
    setValues(SYSTEM_SETTINGS_DEFAULTS);
    toast.info("Valores padrão carregados — clique em \"Salvar Alterações\" pra confirmar.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Regras do Sistema</h2>
          <p className="text-sm text-muted-foreground">Configure todas as regras de negócio da barbearia</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={isPending}
            onClick={() => startTransition(() => router.refresh())}
            title="Atualizar"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleRestoreDefaults}>
            <RotateCcw className="mr-1 h-4 w-4" /> Restaurar Padrão
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-1 h-4 w-4" /> {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          <div>
            <h3 className="font-semibold">Regras de No-Show</h3>
            <p className="text-sm text-muted-foreground">Configure ações automáticas para clientes que não comparecem</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="noShowThreshold">Limite de no-shows para ação</Label>
            <Input
              id="noShowThreshold"
              type="number"
              min={1}
              value={values.noShowThreshold}
              onChange={(e) => set("noShowThreshold", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Após {values.noShowThreshold || 0} no-shows, a ação abaixo será aplicada
            </p>
          </div>
          <div className="space-y-2">
            <Label>Ação ao atingir limite</Label>
            <Select value={values.noShowAction} onValueChange={(v) => set("noShowAction", v as NoShowAction)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NO_SHOW_ACTION_LABEL).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <div>
            <h3 className="font-semibold">Regras de Agendamento</h3>
            <p className="text-sm text-muted-foreground">Configure antecedência mínima e máxima para agendamentos</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bookingMinLeadMinutes">Antecedência mínima (minutos)</Label>
            <Input
              id="bookingMinLeadMinutes"
              type="number"
              min={0}
              value={values.bookingMinLeadMinutes}
              onChange={(e) => set("bookingMinLeadMinutes", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Cliente precisa agendar com pelo menos {values.bookingMinLeadMinutes || 0} minutos de antecedência
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bookingMaxLeadDays">Antecedência máxima (dias)</Label>
            <Input
              id="bookingMaxLeadDays"
              type="number"
              min={1}
              value={values.bookingMaxLeadDays}
              onChange={(e) => set("bookingMaxLeadDays", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Cliente pode agendar até {values.bookingMaxLeadDays || 0} dias no futuro
            </p>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <div>
            <h3 className="font-semibold">Comissões Padrão</h3>
            <p className="text-sm text-muted-foreground">
              Defina percentuais padrão de comissão (podem ser sobrescritos por serviço/produto)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultCommissionServicePct">Comissão serviço agendado (%)</Label>
            <Input
              id="defaultCommissionServicePct"
              type="number"
              min={0}
              max={100}
              value={values.defaultCommissionServicePct}
              onChange={(e) => set("defaultCommissionServicePct", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultCommissionWalkInPct">Comissão walk-in (%)</Label>
            <Input
              id="defaultCommissionWalkInPct"
              type="number"
              min={0}
              max={100}
              value={values.defaultCommissionWalkInPct}
              onChange={(e) => set("defaultCommissionWalkInPct", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultCommissionProductPct">Comissão produtos (%)</Label>
            <Input
              id="defaultCommissionProductPct"
              type="number"
              min={0}
              max={100}
              value={values.defaultCommissionProductPct}
              onChange={(e) => set("defaultCommissionProductPct", Number(e.target.value))}
            />
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <div>
            <h3 className="font-semibold">Regras de Assinaturas</h3>
            <p className="text-sm text-muted-foreground">Configure ações automáticas para inadimplência de assinaturas</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subscriptionGraceDays">Dias de tolerância após vencimento</Label>
            <Input
              id="subscriptionGraceDays"
              type="number"
              min={0}
              value={values.subscriptionGraceDays}
              onChange={(e) => set("subscriptionGraceDays", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Cliente continua agendando como assinante por {values.subscriptionGraceDays || 0} dias após o
              vencimento. Depois, assinatura vira vencida e recorrências futuras são canceladas.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
