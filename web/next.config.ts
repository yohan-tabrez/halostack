import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  reactCompiler: true,
  serverExternalPackages: ['ioredis', 'bullmq', '@bull-board/api'],
};

export default nextConfig;
