import type { NoShowAction } from "@/generated/prisma/enums";

/** Mesmos valores de @default no schema — só os campos cobertos pela tela "Regras do Sistema". Sem imports de servidor: usado também no client component. */
export const SYSTEM_SETTINGS_DEFAULTS = {
  noShowThreshold: 10,
  noShowAction: "NONE" as NoShowAction,
  bookingMinLeadMinutes: 30,
  bookingMaxLeadDays: 60,
  defaultCommissionServicePct: 40,
  defaultCommissionWalkInPct: 30,
  defaultCommissionProductPct: 10,
  subscriptionGraceDays: 5,
};
