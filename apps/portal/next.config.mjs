/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // zip-gen and deploy-receive use fs/archiver — keep them on the Node runtime.
  serverExternalPackages: ['archiver'],
  // Required for the multi-stage Dockerfile (SPEC §4.1) — copies .next/standalone instead of
  // shipping node_modules wholesale.
  output: 'standalone',
};
export default nextConfig;
