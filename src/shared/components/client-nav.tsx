"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Clock, CalendarPlus, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/features/client-app/components/notification-bell";
import { ClientUserMenu } from "@/features/client-app/components/client-user-menu";

const LINKS = [
  { href: "/inicio", label: "Início", icon: Home },
  { href: "/horarios", label: "Horários", icon: Clock },
  { href: "/agendar", label: "Agendar", icon: CalendarPlus },
  { href: "/plano", label: "Plano", icon: CreditCard },
];

/**
 * App do cliente é mobile-first (PWA) — navegação principal fica numa
 * barra fixa embaixo, ao alcance do polegar e com alvo de toque de
 * verdade (~56px), padrão de app mobile. A barra de cima fica só com
 * marca/localização/notificação, sem competir por espaço com os links.
 */
export function ClientNav({
  unitName,
  userName,
  userEmail,
}: {
  unitName: string;
  userName: string | null;
  userEmail: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Image src="/brand/logo.jpg" alt="Barbearia Bacelar" width={28} height={28} className="rounded" />
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Localização atual</p>
            <p className="text-sm font-medium">{unitName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <ClientUserMenu name={userName} email={userEmail} />
        </div>
      </div>
    </header>
  );
}

export function ClientBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              // Mesmo motivo do menu do admin: as 4 abas são páginas
              // dinâmicas (auth-gated) — prefetch automático das 4 toda
              // vez que o cliente abre qualquer tela do app não vale o
              // custo de consultas ao banco em segundo plano.
              prefetch={false}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-6 w-6" />
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
