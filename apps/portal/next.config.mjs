/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // zip-gen and deploy-receive use fs/archiver — keep them on the Node runtime.
  serverExternalPackages: ['archiver'],
};
export default nextConfig;
