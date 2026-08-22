import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Barbearia Bacelar",
    short_name: "Bacelar",
    description: "Sistema de agendamento da Barbearia Bacelar",
    start_url: "/",
    display: "standalone",
    background_color: "#181510",
    theme_color: "#181510",
    icons: [
      {
        src: "/brand/logo.jpg",
        sizes: "640x640",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/brand/logo.jpg",
        sizes: "640x640",
        type: "image/jpeg",
        purpose: "maskable",
      },
    ],
  };
}
