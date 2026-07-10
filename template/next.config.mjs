/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ponytail: keep the template dependency-free (no eslint/eslint-config-next installed).
  // Re-enable once the project adds real lint tooling.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
