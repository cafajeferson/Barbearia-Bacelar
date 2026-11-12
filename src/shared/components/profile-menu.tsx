"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, LogOut, Repeat, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logoutAction, switchProfileAction } from "@/server/auth/actions";
import { initials } from "@/shared/lib/format";
import { cn } from "@/lib/utils";

export type ProfileSwitch = {
  mode: "admin" | "profissional" | "cliente";
  options: Array<"admin" | "profissional" | "cliente">;
  hasProfessional: boolean;
  hasClient: boolean;
};

const MODES = [
  { value: "admin", label: "Administrador" },
  { value: "profissional", label: "Profissional" },
  { value: "cliente", label: "Cliente" },
] as const;

/**
 * Menu do usuário (nome, e-mail, papel, Configurações, Trocar perfil, Sair).
 * "Trocar perfil" (`profileSwitch`): o admin alterna entre Administrador,
 * Profissional (Minha Agenda) e Cliente (app); o profissional, entre
 * Profissional e Cliente.
 */
export function ProfileMenu({
  name,
  email,
  avatarUrl = null,
  profileSwitch,
  variant = "sidebar",
  submenu = variant === "sidebar",
}: {
  name: string;
  email: string;
  /** Foto da conta Google; sem foto, as iniciais. */
  avatarUrl?: string | null;
  profileSwitch: ProfileSwitch | null;
  /** "sidebar": linha com avatar + nome (rodapé do menu do admin); "compact": só o avatar (cabeçalhos). */
  variant?: "sidebar" | "compact";
  /** "Trocar perfil" como submenu lateral (computador) ou em lista no próprio menu (celular). */
  submenu?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [askName, setAskName] = useState(false);
  const [proName, setProName] = useState(name);
  const mode = profileSwitch?.mode ?? null;
  const roleLabel = mode ? MODES.find((m) => m.value === mode)!.label : null;

  function go(target: ProfileSwitch["mode"], professionalName?: string) {
    startTransition(async () => {
      try {
        await switchProfileAction(target, professionalName);
      } catch (err) {
        // redirect() do Next sobe como erro "NEXT_REDIRECT": é o caminho normal.
        if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
        toast.error(err instanceof Error ? err.message : "Não foi possível trocar de perfil.");
      }
    });
  }

  function choose(target: ProfileSwitch["mode"]) {
    if (!profileSwitch || target === mode) return;
    if (target === "profissional" && !profileSwitch.hasProfessional) {
      setAskName(true);
      return;
    }
    go(target);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-md text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
              variant === "sidebar" ? "w-full p-1.5" : "p-1",
            )}
            title="Menu do usuário"
          >
            <Avatar className="h-8 w-8 shrink-0">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={name} referrerPolicy="no-referrer" />}
              <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
            </Avatar>
            {variant === "sidebar" && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {pending ? "Trocando..." : (roleLabel ?? "")}
                </span>
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={variant === "sidebar" ? "start" : "end"}
          side={variant === "sidebar" ? "top" : "bottom"}
          collisionPadding={8}
          className="w-60 max-w-[calc(100vw-1rem)]"
        >
          <DropdownMenuLabel className="font-normal">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
            {roleLabel && <p className="mt-0.5 text-xs font-semibold text-primary">{roleLabel}</p>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {mode === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/configuracoes" prefetch={false}>
                <Settings className="mr-2 h-4 w-4" /> Configurações
              </Link>
            </DropdownMenuItem>
          )}
          {/* Celular / cabeçalhos: opções em lista, dentro do próprio menu (o
              submenu lateral saía da tela). Computador: submenu ao lado. */}
          {profileSwitch && !submenu && (
            <>
              <DropdownMenuLabel className="flex items-center text-xs font-medium text-muted-foreground">
                <Repeat className="mr-2 h-4 w-4" /> Trocar perfil
              </DropdownMenuLabel>
              {MODES.filter((m) => profileSwitch.options.includes(m.value)).map((m) => (
                <DropdownMenuItem key={m.value} onSelect={() => choose(m.value)} className="justify-between pl-8">
                  {m.label}
                  {m.value === mode ? (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <Check className="h-3.5 w-3.5" /> atual
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {profileSwitch && submenu && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Repeat className="mr-2 h-4 w-4" /> Trocar perfil
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {MODES.filter((m) => profileSwitch.options.includes(m.value)).map((m) => (
                  <DropdownMenuItem key={m.value} onSelect={() => choose(m.value)} className="justify-between">
                    {m.label}
                    {m.value === mode ? (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <Check className="h-3.5 w-3.5" /> atual
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logoutAction()} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={askName} onOpenChange={setAskName}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atender como profissional</DialogTitle>
            <DialogDescription>
              Sua conta ainda não tem cadastro de barbeiro. Ele é criado agora, nesta mesma conta: você aparece na agenda
              (segunda a sábado, 9h às 19h — dá para mudar na Equipe) e passa a ter a sua Minha Agenda.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pro-name">Nome na agenda</Label>
            <Input id="pro-name" value={proName} onChange={(e) => setProName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAskName(false)}>
              Cancelar
            </Button>
            <Button disabled={pending || proName.trim().length < 2} onClick={() => go("profissional", proName.trim())}>
              {pending ? "Criando..." : "Criar e trocar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
