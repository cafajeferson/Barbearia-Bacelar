/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ];
  },
};

export default nextConfig;
