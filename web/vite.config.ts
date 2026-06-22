import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Friday web app. Proxies /api to the Node backend so the whole thing runs
// from a single origin in dev (http://localhost:5173).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
