"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setProfessionalAdminAccessAction } from "../actions";

/** Dá ou tira o acesso de admin de um colaborador (Equipe). */
export function AdminAccessButton({ professionalId, name, isAdmin }: { professionalId: string; name: string; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function toggle() {
    const msg = isAdmin
      ? `Tirar o acesso de admin de ${name}? Ele continua como colaborador.`
      : `Dar acesso de admin para ${name}? Ele passa a ver e mexer em tudo do sistema, e troca para a visão de colaborador pelo menu.`;
    if (!window.confirm(msg)) return;
    startTransition(async () => {
      try {
        await setProfessionalAdminAccessAction({ professionalId, admin: !isAdmin });
        toast.success(isAdmin ? `${name} agora é só colaborador.` : `${name} agora também é admin.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível alterar o acesso.");
      }
    });
  }
  return (
    <Button size="icon" variant="ghost" disabled={pending} onClick={toggle} title={isAdmin ? "Tirar acesso de admin" : "Dar acesso de admin"}>
      {isAdmin ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
    </Button>
  );
}
