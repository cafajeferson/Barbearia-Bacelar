import Link from "next/link";
import { Package, Scissors, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReportTab = "servicos" | "clientes" | "produtos";

const TABS: { value: ReportTab; label: string; icon: typeof Scissors }[] = [
  { value: "servicos", label: "Serviços", icon: Scissors },
  { value: "clientes", label: "Clientes", icon: Users },
  { value: "produtos", label: "Produtos", icon: Package },
];

/** Abas de Relatórios: Serviços / Clientes / Produtos. */
export function ReportTabs({ basePath, active }: { basePath: string; active: ReportTab }) {
  return (
    <nav className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/80 p-1 sm:w-fit">
      {TABS.map(({ value, label, icon: Icon }) => (
        <Link
          key={value}
          href={value === "servicos" ? basePath : `${basePath}?aba=${value}`}
          prefetch={false}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium sm:flex-none",
            active === value ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent",
          )}
        >
          <Icon className="h-4 w-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}

export function parseTab(aba: string | undefined): ReportTab {
  return aba === "clientes" || aba === "produtos" ? aba : "servicos";
}
