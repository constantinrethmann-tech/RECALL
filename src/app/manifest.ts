import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/env";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const icon = (file: string) => `${BASE_PATH}/icons/${file}`;
  return {
    id: `${BASE_PATH}/`,
    name: "RECALL",
    short_name: "RECALL",
    description: "Spaced repetition, tailored.",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "any",
    background_color: "#06070A",
    theme_color: "#06070A",
    categories: ["education", "productivity"],
    icons: [
      { src: icon("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon("icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Study all", short_name: "Study", url: `${BASE_PATH}/study/` },
      { name: "Import cards", short_name: "Import", url: `${BASE_PATH}/import/` },
    ],
  };
}
