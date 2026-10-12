// Um identificador novo a cada `next build` — embutido no JS do navegador e
// devolvido por /api/version; quando os dois divergem (houve deploy), o
// VersionWatcher recarrega a página (ver src/shared/components/version-watcher.tsx).
// Vem da variável BUILD_ID definida no Dockerfile (e não de um Date.now()
// aqui): o Next carrega este arquivo em vários processos durante o build, e
// cada um geraria um valor diferente. Sem a variável (ex.: `next dev`) fica
// "dev", o que desliga a checagem.
const BUILD_ID = process.env.BUILD_ID ?? "dev";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  // Build standalone (server.js autocontido + só as deps de produção
  // realmente usadas) — é o formato que o Dockerfile de deploy (Fase 10)
  // espera; sem isso a imagem final levaria o node_modules inteiro.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // Reforço explícito de "nunca cacheie o HTML do app" — mesma
        // exclusão de estáticos do middleware (_next/static tem hash no
        // nome, PODE e deve ficar em cache longo; brand/manifest/catalog
        // também). Sem isso, quem instala o atalho na tela inicial (PWA)
        // às vezes fica preso numa versão antiga até limpar os dados do
        // site, mesmo com o app já rodando em páginas dinâmicas.
        source: "/((?!_next/static|_next/image|brand|manifest|favicon.ico|catalog).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
