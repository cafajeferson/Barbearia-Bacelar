import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { withAppContext, type AppContext } from "@/server/db/context";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/dashboard",
  PROFESSIONAL: "/minha-agenda",
  CLIENT: "/inicio",
};

const BOOTSTRAP: AppContext = { role: "ADMIN", userId: null };

/**
 * Callback do OAuth (hoje só Google) — troca o code por sessão e, no
 * primeiro acesso de alguém que nunca logou antes, cria automaticamente o
 * cadastro de CLIENTE (nome/e-mail vêm do perfil do Google; telefone fica
 * em branco, cliente completa depois se quiser — ver migration
 * client_phone_nullable). Staff nunca é criado por aqui: só quem já foi
 * cadastrado por um admin ganha um papel diferente de CLIENT.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // NÃO usar `new URL(request.url).origin` aqui: atrás do nginx, o server
  // standalone do Next não reconstrói o host externo de forma confiável e
  // cai pro endereço interno do container (http://0.0.0.0:3000) — o login
  // com Google te devolvia pro localhost/0.0.0.0 em vez do domínio real.
  // Monta a origem a partir do header que o proxy manda de verdade.
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = `${forwardedProto}://${forwardedHost}`;
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  let authUser = data.user;
  if (error || !authUser) {
    // O navegador às vezes pede este callback DUAS vezes com o mesmo code
    // (visto no access log do nginx: Chrome no Android, duas requisições
    // com 1s de diferença — típico de quem tem o PWA instalado, quando o
    // link de volta do Google é reaberto dentro do app). O code é de uso
    // único: a 1ª troca dá certo e a 2ª falha com "invalid flow state" —
    // e era a resposta da 2ª que o usuário via ("erro no login com Google,
    // só entra na segunda tentativa"), mesmo já estando logado pela 1ª.
    // Se já existe sessão válida nos cookies, é esse caso: segue o fluxo
    // normal em vez de devolver erro.
    const { data: existing } = await supabase.auth.getUser();
    authUser = existing.user;
    if (!authUser) {
      console.error("[auth/callback] exchangeCodeForSession falhou:", error?.message ?? "sem data.user");
      // Passa pela raiz em vez de ir direto pro /login: se as duas
      // requisições rodaram ao mesmo tempo, o cookie de sessão da 1ª pode
      // chegar logo depois desta resposta — a raiz redireciona pra home do
      // papel se houver sessão, e só mostra o erro se realmente não houver.
      return NextResponse.redirect(`${origin}/?error=oauth`);
    }
  }

  let appUser = await withAppContext(BOOTSTRAP, (tx) =>
    tx.user.findUnique({ where: { authUserId: authUser.id }, select: { id: true, role: true, active: true } }),
  );

  if (!appUser) {
    const email = authUser.email;
    if (!email) {
      return NextResponse.redirect(`${origin}/login?error=sem-email`);
    }

    const existingByEmail = await withAppContext(BOOTSTRAP, (tx) =>
      tx.user.findUnique({
        where: { email },
        select: { id: true, role: true, active: true, authUserId: true },
      }),
    );

    if (existingByEmail && !existingByEmail.authUserId) {
      // Cliente/staff já cadastrado com esse e-mail (ex.: walk-in) usando
      // Google pela primeira vez — linka em vez de duplicar.
      await withAppContext(BOOTSTRAP, (tx) =>
        tx.user.update({ where: { id: existingByEmail.id }, data: { authUserId: authUser.id } }),
      );
      appUser = existingByEmail;
    } else if (existingByEmail) {
      // Já linkado a OUTRA conta Google/Auth — não deveria acontecer via
      // signInWithOAuth normal, mas não sobrescreve silenciosamente.
      return NextResponse.redirect(`${origin}/login?error=conflito`);
    } else {
      const googleMetadata = authUser.user_metadata as Record<string, unknown> | null;
      const name =
        (googleMetadata?.full_name as string | undefined) ??
        (googleMetadata?.name as string | undefined) ??
        email;

      const created = await withAppContext(BOOTSTRAP, (tx) =>
        tx.user.create({
          data: { email, name, authUserId: authUser.id, role: "CLIENT" },
        }),
      );
      await withAppContext(BOOTSTRAP, (tx) =>
        tx.client.create({ data: { userId: created.id, name, email } }),
      );
      appUser = { id: created.id, role: created.role, active: created.active };
    }
  }

  if (!appUser.active) {
    return NextResponse.redirect(`${origin}/login?error=inativo`);
  }

  // app_metadata.role é o que o middleware lê (edge-safe, sem Prisma) —
  // precisa estar certo mesmo pra quem acabou de ser criado agora.
  //
  // O JWT que acabou de ir pro cookie foi emitido ANTES deste update, então
  // no 1º login de alguém ele ainda não tem o papel: o middleware barrava a
  // home e devolvia a pessoa pro /login, e só o 2º login (JWT novo, já com
  // o papel) entrava. refreshSession() troca o cookie por um JWT atualizado
  // ainda nesta resposta. Quem já tem o papel certo no JWT (todo login
  // depois do primeiro) pula as duas chamadas ao Supabase Auth.
  if (authUser.app_metadata?.role !== appUser.role) {
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.updateUserById(authUser.id, { app_metadata: { role: appUser.role } });
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error("[auth/callback] refreshSession falhou:", refreshError.message);
    }
  }

  return NextResponse.redirect(`${origin}${ROLE_HOME[appUser.role] ?? "/login"}`);
}
