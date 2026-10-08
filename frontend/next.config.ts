import type { NextConfig } from "next";

// The browser calls /api/* on the frontend's own origin and Next forwards it to FastAPI,
// so one public URL serves the whole app and no CORS setup is needed.
const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const config: NextConfig = {
  rewrites: async () => [{ source: "/api/:path*", destination: `${backend}/:path*` }],
  experimental: { proxyClientMaxBodySize: "16mb" },  // uploads are capped at 15 MB by the API
};
export default config;
