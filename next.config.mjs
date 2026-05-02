/** @type {import("next").NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "/api/chat": ["./data/nec/index/**/*.json"],
  },
};

export default nextConfig;
