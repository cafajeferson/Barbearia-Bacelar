import { LogOut } from "lucide-react";
import { logoutAction } from "@/server/auth/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
        title="Sair"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </form>
  );
}
