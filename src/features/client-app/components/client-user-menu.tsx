"use client";

import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/server/auth/actions";

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Menu do cliente: foto da conta Google quando existe; sem foto, as iniciais. */
export function ClientUserMenu({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl?: string | null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <Avatar className="h-8 w-8">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name ?? "Foto"} referrerPolicy="no-referrer" />}
          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 font-normal">
          <Avatar className="h-10 w-10 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name ?? "Foto"} referrerPolicy="no-referrer" />}
            <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium text-foreground">{name ?? "Cliente"}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">{email}</p>
            <Badge variant="secondary" className="mt-1">
              Cliente
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => logoutAction()}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
