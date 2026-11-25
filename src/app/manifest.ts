import type { MetadataRoute } from "next";

// Installed app (home screen on Android and desktop): name, colors and the CBB · OneAI icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prontuário CBB",
    short_name: "Prontuário CBB",
    description: "Prontuário clínico das seleções brasileiras de basquete, com o CBB Intelligence.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b1f4d",
    theme_color: "#f5f6f2",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
