import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pins the workspace root explicitly — without this, Next.js finds a
  // stray package-lock.json at ~/package-lock.json (unrelated to this
  // project) and guesses the wrong root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
