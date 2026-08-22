"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WizardProgressBar } from "./progress-bar";
import { Step1Service } from "./step1-service";
import { Step2Professional } from "./step2-professional";
import { Step3Schedule } from "./step3-schedule";
import { Step4Confirm } from "./step4-confirm";
import type { WizardProfessional, WizardService, WizardSubscription } from "./types";
import { bookAppointmentAsClientAction } from "@/features/appointments/actions";

export function BookingWizard({
  unitId,
  unitName,
  services,
  professionals,
  subscriptions,
  cancellationWindowHours,
  initialServiceId,
}: {
  unitId: string;
  unitName: string;
  services: WizardService[];
  professionals: WizardProfessional[];
  subscriptions: WizardSubscription[];
  cancellationWindowHours: number;
  initialServiceId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    initialServiceId ? [initialServiceId] : [],
  );
  const [professionalChoice, setProfessionalChoice] = useState<string | "ANY" | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [recurringIntervalDays, setRecurringIntervalDays] = useState(30);
  const [couponCode, setCouponCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"LOCAL" | "SUBSCRIPTION">("LOCAL");
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);

  const professionalIds = useMemo(
    () => (professionalChoice === "ANY" ? professionals.map((p) => p.id) : professionalChoice ? [professionalChoice] : []),
    [professionalChoice, professionals],
  );

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleConfirm() {
    if (!selectedDate || !selectedTime || !professionalChoice) return;
    setSubmitting(true);
    try {
      await bookAppointmentAsClientAction({
        unitId,
        professionalId: professionalChoice,
        candidateProfessionalIds: professionalChoice === "ANY" ? professionals.map((p) => p.id) : undefined,
        serviceIds: selectedServiceIds,
        scheduledDate: selectedDate.toISOString().slice(0, 10),
        startTime: selectedTime,
        couponCode: couponCode || undefined,
        paymentMethod,
        subscriptionId: subscriptionId ?? undefined,
        recurring: recurring ? { intervalDays: recurringIntervalDays } : undefined,
      });
      toast.success("Agendamento confirmado!");
      router.push("/horarios");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar agendamento.");
    } finally {
      setSubmitting(false);
    }
  }

  const professionalForSummary =
    professionalChoice === "ANY"
      ? { id: "ANY" as const, name: "Qualquer Profissional" }
      : professionals.find((p) => p.id === professionalChoice) ?? { id: "ANY" as const, name: "" };

  return (
    <div className="pb-8">
      <WizardProgressBar step={step} />

      {step === 1 && (
        <Step1Service
          services={services}
          selectedIds={selectedServiceIds}
          onToggle={toggleService}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <Step2Professional
          professionals={professionals}
          selected={professionalChoice}
          onSelect={setProfessionalChoice}
          onContinue={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <Step3Schedule
          professionalIds={professionalIds}
          durationMinutes={totalDuration || 30}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          recurring={recurring}
          recurringIntervalDays={recurringIntervalDays}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setSelectedTime(null);
          }}
          onSelectTime={setSelectedTime}
          onRecurringChange={setRecurring}
          onIntervalChange={setRecurringIntervalDays}
          onContinue={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && selectedDate && selectedTime && (
        <Step4Confirm
          unitName={unitName}
          services={selectedServices}
          professional={professionalForSummary}
          date={selectedDate}
          time={selectedTime}
          totalPrice={totalPrice}
          totalDuration={totalDuration}
          couponCode={couponCode}
          onCouponCodeChange={setCouponCode}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          subscriptions={subscriptions}
          subscriptionId={subscriptionId}
          onSubscriptionChange={setSubscriptionId}
          cancellationWindowHours={cancellationWindowHours}
          submitting={submitting}
          onConfirm={handleConfirm}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}
