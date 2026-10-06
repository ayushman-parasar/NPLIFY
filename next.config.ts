import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Anthropic SDK and Neon driver run in the Node.js runtime of the API routes.
  serverExternalPackages: ["@anthropic-ai/sdk", "@neondatabase/serverless"],
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
