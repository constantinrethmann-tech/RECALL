import type { NextConfig } from "next";

// RECALL is a static site (hosted on GitHub Pages under /recall).
// Everything that needs a server lives in Supabase.
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
