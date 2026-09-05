import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Connect RPC full names start with the proto package (app.studio.v1.*),
// so both the dev proxy and the Caddy reverse proxy route that prefix.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/app.studio.v1": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
    },
  },
});
