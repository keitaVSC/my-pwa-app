module.exports = {
    scripts: {
        build: "tsc && vite build --mode production && workbox generateSW workbox-config.js"
    }
};