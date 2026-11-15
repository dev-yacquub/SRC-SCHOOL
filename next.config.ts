import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["firebase-admin", "@prisma/client"],
};

export default nextConfig;
