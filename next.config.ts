import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Anthropic SDK and Neon driver run in the Node.js runtime of the API routes.
  serverExternalPackages: ["@anthropic-ai/sdk", "@neondatabase/serverless"],
  allowedDevOrigins: ["127.0.0.1"],
  // The document pack is read from docs/ at request time by /documents/[file]; make sure it ships with that function.
  outputFileTracingIncludes: { "/documents/[file]": ["./docs/**/*"] },
};

export default nextConfig;
