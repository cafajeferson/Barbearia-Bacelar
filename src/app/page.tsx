import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/getAuthContext";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/dashboard",
  PROFESSIONAL: "/minha-agenda",
  CLIENT: "/inicio",
};

export default async function Home() {
  const ctx = await getAuthContext();
  redirect(ctx ? ROLE_HOME[ctx.role] : "/login");
}
