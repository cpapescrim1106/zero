/** @type {import('next').NextConfig} */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath = rawBasePath
  ? rawBasePath.startsWith("/") ? rawBasePath : `/${rawBasePath}`
  : "";
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const apiPath = apiBase.startsWith("http") ? null : apiBase.startsWith("/") ? apiBase : `/${apiBase}`;
const apiSource = apiPath && basePath && apiPath.startsWith(basePath)
  ? apiPath.slice(basePath.length) || "/"
  : apiPath;
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3021";

const nextConfig = {
  reactStrictMode: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  async rewrites() {
    if (!apiSource) {
      return [];
    }
    return [
      {
        source: `${apiSource}/:path*`,
        destination: `${apiTarget}/:path*`
      }
    ];
  }
};

export default nextConfig;
