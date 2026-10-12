"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/server/auth/actions";
import {
  LayoutDashboard,
  CalendarDays,
  Repeat,
  Users,
  UserCog,
  Scissors,
  Package,
  Calculator,
  CreditCard,
  Tag,
  Ticket,
  Clock,
  Settings,
  LogOut,
  Menu,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const TOP_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda Mestre", icon: CalendarDays },
  { href: "/recorrencias", label: "Recorrências", icon: Repeat },
];

const GROUPS: { label: string; links: { href: string; label: string; icon: typeof Users }[] }[] = [
  {
    label: "GESTÃO",
    links: [
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/equipe", label: "Equipe", icon: UserCog },
      { href: "/catalogo", label: "Catálogo", icon: Scissors },
      { href: "/produtos", label: "Produtos", icon: Package },
    ],
  },
  {
    label: "FINANCEIRO",
    links: [
      { href: "/fechamento", label: "Fechamento do mês", icon: Wallet },
      { href: "/comissoes", label: "Comissões", icon: Calculator },
      { href: "/assinaturas", label: "Assinaturas", icon: CreditCard },
      { href: "/promocoes", label: "Promoções", icon: Tag },
      { href: "/cupons", label: "Cupons", icon: Ticket },
    ],
  },
  {
    label: "SISTEMA",
    links: [
      { href: "/em-aberto", label: "Em aberto", icon: Clock },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Users;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      // Todo item do menu é uma rota autenticada/dinâmica (consulta banco de
      // verdade) — o prefetch automático do Next disparava as ~13 páginas
      // TODA VEZ que qualquer tela do admin carregava, brigando pelo pool
      // de conexão do banco com a página que a pessoa realmente queria ver
      // e deixando o site inteiro lento. Navegação continua instantânea ao
      // clicar (só perde o prefetch antecipado, que aqui custava mais do
      // que valia).
      prefetch={false}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/15 font-medium text-primary"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

/** Conteúdo do menu (logo, links, usuário) — o mesmo na barra fixa do desktop e na gaveta do celular. */
function SidebarBody({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <Image
          src="/brand/logo.jpg"
          alt="Barbearia Bacelar"
          width={28}
          height={28}
          className="rounded"
        />
        <span className="font-semibold text-sidebar-foreground">Bacelar</span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {TOP_LINKS.map((link) => (
            <NavLink key={link.href} {...link} active={isActive(link.href)} />
          ))}
        </div>

        {GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 text-xs font-semibold tracking-wider text-sidebar-foreground/50">
              {group.label}
            </p>
            {group.links.map((link) => (
              <NavLink key={link.href} {...link} active={isActive(link.href)} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{userName}</p>
          <p className="truncate text-xs text-sidebar-foreground/50">{userRole}</p>
        </div>
        <button
          onClick={() => logoutAction()}
          className="rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-destructive"
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

/**
 * Barra lateral fixa — só de `lg` pra cima. No celular ela ocupava 256px
 * dos ~390 da tela e espremia todo o conteúdo numa tira; lá o menu vira
 * uma gaveta aberta pelo botão do topo (AdminMobileNav).
 */
export function AdminSidebar({ userName, userRole }: { userName: string; userRole: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex print:!hidden">
      <SidebarBody userName={userName} userRole={userRole} />
    </aside>
  );
}

/** Botão de menu + gaveta lateral pro admin no celular/tablet (abaixo de `lg`). */
export function AdminMobileNav({ userName, userRole }: { userName: string; userRole: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Fecha sozinha ao navegar — senão a gaveta continuava por cima da tela nova.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 max-w-[85vw] flex-col gap-0 border-sidebar-border bg-sidebar p-0">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SidebarBody userName={userName} userRole={userRole} />
      </SheetContent>
    </Sheet>
  );
}
