import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// Latest pushed commits for the companion's "What's new"; read once at build/dev start, empty if git is missing.
function updates() {
  try {
    return execSync("git log -5 --format=%h%x1f%cI%x1f%s", { encoding: "utf8" }).trim().split("\n")
      .map((l) => { const [hash, date, msg] = l.split("\x1f"); return { hash, date, msg }; });
  } catch { return []; }
}

// The browser calls /api/* on the frontend's own origin and Next forwards it to FastAPI,
// so one public URL serves the whole app and no CORS setup is needed.
const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const config: NextConfig = {
  env: { NEXT_PUBLIC_UPDATES: JSON.stringify(updates()) },
  rewrites: async () => [{ source: "/api/:path*", destination: `${backend}/:path*` }],
  experimental: { proxyClientMaxBodySize: "16mb" },  // uploads are capped at 15 MB by the API
};
export default config;
