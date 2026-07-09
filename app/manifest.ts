import type { MetadataRoute } from "next";
import { APP_NAME, APP_DESCRIPTION, BRAND_COLOR } from "@/lib/brand";

// PWA manifest — makes Kosha installable to the phone home screen and the
// desktop. Served at /manifest.webmanifest automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — Personal Finance`,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f1e",
    theme_color: BRAND_COLOR,
    orientation: "portrait-primary",
    categories: ["finance", "productivity"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
