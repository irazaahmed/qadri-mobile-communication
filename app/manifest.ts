import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Qadri Mobile Communication",
    short_name: "Qadri Mobile",
    description: "Qadri Mobile Communication admin panel — inventory, purchases, sales, credit and profit tracking.",
    start_url: "/admin",
    display: "standalone",
    background_color: "#0a1120",
    theme_color: "#0a56c4",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
