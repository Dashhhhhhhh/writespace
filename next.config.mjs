/** @type {import("next").NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "/api/chat": ["./data/code/index/**/*.json"],
    "/sources/[documentId]": ["./data/code/index/**/*.json"],
    "/sources/[documentId]/[locator]": ["./data/code/index/**/*.json"],
    "/nec/[edition]/[section]": ["./data/code/index/**/*.json"],
  },
};

export default nextConfig;
