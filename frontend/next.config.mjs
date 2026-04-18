/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    // Suppresses the WalletConnect/indexedDB SSR warnings that wagmi v2 raises.
    esmExternals: "loose",
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options",        value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy",        value: "same-origin" },
      ],
    }];
  },
};
export default nextConfig;
