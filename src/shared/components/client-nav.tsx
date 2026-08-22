"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Clock, CalendarPlus, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/features/client-app/components/notification-bell";

const LINKS = [
  { href: "/inicio", label: "Início", icon: Home },
  { href: "/horarios", label: "Horários", icon: Clock },
  { href: "/agendar", label: "Agendar", icon: CalendarPlus },
  { href: "/plano", label: "Plano", icon: CreditCard },
];

export function ClientNav({ unitName }: { unitName: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Image src="/brand/logo.jpg" alt="Barbearia Bacelar" width={28} height={28} className="rounded" />
          <div className="hidden sm:block">
            <p className="text-[10px] uppercase text-muted-foreground">Localização atual</p>
            <p className="text-sm font-medium">{unitName}</p>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md px-2.5 py-1.5 text-[11px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <NotificationBell />
      </div>
    </header>
  );
}
