"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/lib/format";
import { validateCouponAction } from "@/features/appointments/actions";
import type { WizardProfessional, WizardService, WizardSubscription } from "./types";

export function Step4Confirm({
  unitName,
  services,
  professional,
  date,
  time,
  totalPrice,
  totalDuration,
  couponCode,
  onCouponCodeChange,
  paymentMethod,
  onPaymentMethodChange,
  subscriptions,
  subscriptionId,
  onSubscriptionChange,
  cancellationWindowHours,
  submitting,
  onConfirm,
  onBack,
}: {
  unitName: string;
  services: WizardService[];
  professional: WizardProfessional | { name: string; id: "ANY" };
  date: Date;
  time: string;
  totalPrice: number;
  totalDuration: number;
  couponCode: string;
  onCouponCodeChange: (v: string) => void;
  paymentMethod: "LOCAL" | "SUBSCRIPTION";
  onPaymentMethodChange: (v: "LOCAL" | "SUBSCRIPTION") => void;
  subscriptions: WizardSubscription[];
  subscriptionId: string | null;
  onSubscriptionChange: (id: string) => void;
  cancellationWindowHours: number;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const [couponInput, setCouponInput] = useState(couponCode);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  async function handleApplyCoupon() {
    if (!couponInput.trim()) {
      onCouponCodeChange("");
      setCouponError(null);
      return;
    }
    setCheckingCoupon(true);
    setCouponError(null);
    try {
      await validateCouponAction(couponInput);
      onCouponCodeChange(couponInput);
    } catch (err) {
      onCouponCodeChange("");
      setCouponError(err instanceof Error ? err.message : "Cupom inválido.");
    } finally {
      setCheckingCoupon(false);
    }
  }

  const usableSubscriptions = subscriptions.filter(
    (s) => s.status === "ACTIVE" && s.creditsUsedThisPeriod < s.plan.creditLimitPerMonth,
  );
  const hasUsableSubscription = usableSubscriptions.length > 0;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Confirmar agendamento</h1>

      <div className="space-y-2 rounded-lg border p-4">
        <Row label="Unidade" value={unitName} />
        <Row label="Serviço" value={`${services.map((s) => s.name).join(" + ")} — ${formatBRL(totalPrice)}`} />
        <Row label="Profissional" value={professional.name} />
        <Row
          label="Data e horário"
          value={`${new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(date)} às ${time}`}
        />
        <Row label="Duração estimada" value={`${totalDuration} min`} />
        <div className="flex items-center justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span>{formatBRL(totalPrice)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Cupom de desconto</label>
        <div className="flex gap-2">
          <Input
            value={couponInput}
            onChange={(e) => {
              setCouponInput(e.target.value.toUpperCase());
              setCouponError(null);
            }}
            placeholder="Digite o código"
          />
          <Button variant="outline" onClick={handleApplyCoupon} disabled={checkingCoupon}>
            {checkingCoupon ? "Verificando..." : "Aplicar"}
          </Button>
        </div>
        {couponError && <p className="text-xs text-destructive">{couponError}</p>}
        {couponCode && !couponError && (
          <p className="text-xs text-success">Cupom &ldquo;{couponCode}&rdquo; será aplicado.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Como você quer pagar?</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onPaymentMethodChange("LOCAL")}
            className={cn(
              "rounded-lg border p-3 text-center text-sm",
              paymentMethod === "LOCAL" && "border-primary bg-primary/10 font-medium text-primary",
            )}
          >
            Pagar no Local
          </button>
          <button
            disabled={!hasUsableSubscription}
            onClick={() => hasUsableSubscription && onPaymentMethodChange("SUBSCRIPTION")}
            className={cn(
              "relative rounded-lg border p-3 text-center text-sm",
              paymentMethod === "SUBSCRIPTION" && "border-primary bg-primary/10 font-medium text-primary",
              !hasUsableSubscription && "cursor-not-allowed opacity-50",
            )}
          >
            {!hasUsableSubscription && <Lock className="absolute right-2 top-2 h-3 w-3" />}
            Pagar com Assinatura
          </button>
        </div>
        {paymentMethod === "SUBSCRIPTION" && hasUsableSubscription && (
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={subscriptionId ?? ""}
            onChange={(e) => onSubscriptionChange(e.target.value)}
          >
            <option value="" disabled>
              Selecione a assinatura
            </option>
            {usableSubscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.plan.name} ({s.creditsUsedThisPeriod}/{s.plan.creditLimitPerMonth} créditos usados)
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Ao confirmar, você concorda com nossos termos de serviço e política de cancelamento.
        Cancelamentos com menos de {cancellationWindowHours}h de antecedência podem estar sujeitos a cobrança.
      </p>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>
          Voltar
        </Button>
        <Button className="flex-1" onClick={onConfirm} disabled={submitting}>
          {submitting ? "Confirmando..." : "Confirmar agendamento"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
