/** API Nest chạy riêng. Web gọi qua `/api/*` để cookie session đi cùng site với trang (ADR 0004). */
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8787";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@credflow/contracts"],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};
export default nextConfig;
