/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev) {
      // On Windows the webpack filesystem cache under `.next/` has been
      // intermittently dropping numbered server chunks (`./682.js`,
      // `vendor-chunks/@swc.js`) during hot reload, which leaves the browser
      // requesting stale `/_next/static/*` assets and strands `/roleplay` on
      // its server-rendered "Connecting call…" shell before hydration.
      // Keep dev cache in-memory for stability; production builds still use the
      // normal Next.js pipeline.
      config.cache = { type: 'memory' };
    }
    return config;
  },
};
