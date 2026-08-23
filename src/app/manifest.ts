import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Barbearia Bacelar",
    short_name: "Bacelar",
    description: "Sistema de agendamento da Barbearia Bacelar",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/brand/icon-any.png",
        sizes: "640x640",
        type: "image/png",
        purpose: "any",
      },
      {
        // "maskable" é recortado pelo Android (o SO aplica uma máscara
        // circular/squircle e descarta ~20% das bordas) — precisa de uma
        // versão com a arte bem mais pra dentro, senão corta o texto/ícone
        // nas pontas (era o que estava cortando o logo na tela inicial).
        src: "/brand/icon-maskable.png",
        sizes: "640x640",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
