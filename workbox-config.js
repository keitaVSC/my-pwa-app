export default {
    globDirectory: "dist/",
    globPatterns: [
      "**/*.{js,css,html,ico,png,svg,webmanifest}"
    ],
    swDest: "dist/sw.js",
    sourcemap: true,
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true
  };