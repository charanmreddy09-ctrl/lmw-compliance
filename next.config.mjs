/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Fonts load at runtime; this keeps `next build` from needing network access.
  optimizeFonts: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverComponentsExternalPackages: ['pg', 'bcryptjs'] },
};
export default nextConfig;
