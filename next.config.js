/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["page.tsx"],
  compiler: {
    styledComponents: true,
  },
  experimental: {
    swcPlugins: [["next-superjson-plugin", { excluded: [] }]],
  },
};

module.exports = nextConfig;
