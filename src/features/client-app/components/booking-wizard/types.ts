export type WizardService = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  genderTag: string | null;
};

export type WizardProfessional = {
  id: string;
  name: string;
  color: string;
  title: string | null;
};

export type WizardSubscription = {
  id: string;
  status: string;
  creditsUsedThisPeriod: number;
  plan: { name: string; creditLimitPerMonth: number };
};
