import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InspectFlow — Rapports d'inspection",
    short_name: "InspectFlow",
    description:
      "Capturez photos et notes d'inspection, même sans connexion. Synchronisation automatique.",
    start_url: "/dashboard/simple",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    orientation: "portrait-primary",
    categories: ["business", "utilities"],
    icons: [
      {
        src: "/placeholder-image.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/placeholder-image.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
