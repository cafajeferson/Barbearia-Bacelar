import { NextResponse } from "next/server";

// Sempre a versão do servidor que está rodando AGORA — nunca resposta em cache.
export const dynamic = "force-dynamic";

/**
 * Identificador do build em execução (ver next.config.mjs). O
 * VersionWatcher compara com o identificador embutido no JS que o
 * navegador já tem aberto e recarrega a página quando são diferentes.
 */
export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
