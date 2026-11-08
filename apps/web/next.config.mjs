/** API Nest chạy riêng. Web gọi qua `/api/*` để cookie session đi cùng site với trang (ADR 0004). */
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8787";

// Plan 34: dán biến trên dashboard hay kéo theo khoảng trắng; lỗi gốc của Next ("destination does
// not start with...") khó hiểu. Kiểm sớm, nêu đúng tên biến.
if (API_URL !== API_URL.trim()) {
  throw new Error(
    `API_URL có khoảng trắng ở đầu hoặc cuối: ${JSON.stringify(API_URL)}`,
  );
}
if (!/^https?:\/\/[^\s/]+/.test(API_URL) || API_URL.endsWith("/")) {
  throw new Error(
    `API_URL phải dạng http(s)://host[:port], không có "/" ở cuối; đang là ${JSON.stringify(API_URL)}`,
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@credflow/contracts"],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};
export default nextConfig;
