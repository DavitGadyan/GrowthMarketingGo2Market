/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` traces exactly the files this app needs and emits a
  // self-contained server at .next/standalone/server.js.
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: { formats: ["image/avif", "image/webp"] },
  poweredByHeader: false,
  // v1 routes keep working after the v2 information architecture.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/growth", permanent: false },
      { source: "/market", destination: "/growth", permanent: false },
      { source: "/matrix", destination: "/ideas", permanent: false },
      { source: "/deliverables", destination: "/templates", permanent: false },
    ];
  },
};

export default nextConfig;
