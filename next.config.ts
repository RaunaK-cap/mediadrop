import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allow the sandbox preview domain to load dev resources (HMR/JS)
  // without this, the preview proxy gets blocked and the page renders
  // with JS missing → entrance animations never fire → blank sky
  allowedDevOrigins: ["3000-sess-00p0laxi1khs0ubymk47.preview.qoderwork.com"],
};

export default nextConfig;
