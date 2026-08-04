/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // `next build` and `next dev` share `.next`, so verifying a build while a dev
  // server is running replaces the chunks that server still holds and every
  // route starts 500ing with "Cannot find module './948.js'" — the same Windows
  // chunk-dropping failure the webpack note below describes, just triggered
  // deliberately. Set NEXT_DIST_DIR to build somewhere else instead:
  //   NEXT_DIST_DIR=.next-verify npm run build
  // Unset, behaviour is exactly as before.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
