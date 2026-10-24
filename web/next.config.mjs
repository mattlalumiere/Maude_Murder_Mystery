/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the container image (node server.js).
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
};
export default nextConfig;
