import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Serviço", "Profissional", "Horário", "Confirmar"];

export function WizardProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      {STEPS.map((label, i) => {
        const stepNumber = i + 1;
        const done = stepNumber < step;
        const current = stepNumber === step;
        return (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-medium",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && "border-primary text-primary",
                  !done && !current && "border-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : stepNumber}
              </div>
              <span
                className={cn(
                  "text-[10px]",
                  current ? "font-medium text-primary" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {stepNumber < STEPS.length && (
              <div className={cn("mx-1 h-0.5 flex-1", done ? "bg-primary" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
