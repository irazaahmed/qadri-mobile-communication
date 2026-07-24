import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows the LAN IP to load dev-only resources (HMR websocket, etc.) when
  // testing on a phone via `http://<lan-ip>:3000` instead of localhost.
  // Update this if the machine's LAN IP changes.
  allowedDevOrigins: ["192.168.1.2"],
};

export default nextConfig;
