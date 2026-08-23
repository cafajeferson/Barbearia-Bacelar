import { LoginPageClient } from "./login-form";

// Sem isso, o Next.js gera /login como página estática (o bailout do
// useSearchParams pra client-side rendering faz o corpo do componente
// cliente virar um placeholder vazio pro build, candidato perfeito a
// caching agressivo) e manda Cache-Control com s-maxage de 1 ANO — o
// navegador guardava a casca HTML antiga (apontando pro JS antigo) e um
// simples F5 não pegava o layout novo depois de um deploy. O
// force-dynamic só funciona vindo de um Server Component — por isso o
// componente de verdade foi pra login-form.tsx ("use client"), e esse
// arquivo virou só a config de cache + o ponto de entrada da rota.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginPageClient />;
}
