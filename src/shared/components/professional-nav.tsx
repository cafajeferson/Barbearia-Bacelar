"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/minha-agenda", label: "Minha Agenda", icon: CalendarDays },
  { href: "/meus-relatorios", label: "Relatórios", icon: BarChart3 },
];

/** Abas do profissional (Minha Agenda / Relatórios), logo abaixo do cabeçalho. */
export function ProfessionalNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b px-3 py-2">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
