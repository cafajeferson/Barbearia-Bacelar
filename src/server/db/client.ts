import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.APP_DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

// Conecta como "app_user" (não-superusuário) — é o papel a que as policies
// de RLS realmente se aplicam. Nunca troque isto pela DATABASE_URL do
// superusuário "postgres" usada pelo `prisma migrate`.
export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
