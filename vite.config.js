import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative asset paths so the build works under GitHub Pages' /<repo>/ path.
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Candle-data fallback: Finnhub free keys 403 on /stock/candle, and Yahoo
      // Finance doesn't send CORS headers, so the dev server proxies it.
      // The hosted build reads daily snapshots instead (scripts/fetch-candles.mjs).
      "/yahoo": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo/, ""),
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    },
  },
});
