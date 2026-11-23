import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RPG Forge",
    short_name: "RPG Forge",
    description: "Crie, valide e jogue com fichas de RPG de mesa, Modo Mesa e campanhas ao vivo.",
    start_url: "/app",
    display: "standalone",
    background_color: "#141210",
    theme_color: "#d4af37",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
