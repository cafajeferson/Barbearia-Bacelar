import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/getAuthContext";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/dashboard",
  PROFESSIONAL: "/minha-agenda",
  CLIENT: "/inicio",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getAuthContext();
  if (ctx) redirect(ROLE_HOME[ctx.role]);
  // ?error=oauth vem do /auth/callback quando a troca do code falhou e não
  // havia sessão naquela requisição — só chega até o /login se, aqui, a
  // pessoa continuar sem sessão (ver comentário no callback).
  const { error } = await searchParams;
  redirect(error === "oauth" ? "/login?error=oauth" : "/login");
}
