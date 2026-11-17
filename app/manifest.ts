import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zomboid Mod Manager",
    short_name: "PZ Mods",
    description: "Project Zomboid 모드 관리",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b111a",
    theme_color: "#0b111a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
  };
}
