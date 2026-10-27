/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@credflow/contracts"],
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
