import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@whiskeysockets/baileys", "pino", "qrcode", "ws"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;


