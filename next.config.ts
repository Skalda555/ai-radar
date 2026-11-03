import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Type safety is enforced by `npm run typecheck` (tsc --noEmit). Next's
  // build-time type checker forks a worker process, which this sandbox blocks.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Worker threads instead of forked child processes: the sandbox blocks
    // process spawning. Same isolation for page-data collection.
    workerThreads: true,
  },
  images: {
    // Real YouTube thumbnails only. No image proxy is configured, so unknown hosts stay blocked.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
};

export default nextConfig;
