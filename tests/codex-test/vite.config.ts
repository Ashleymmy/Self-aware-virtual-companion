import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { registerWorkbenchMiddleware } from "./server/middleware.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  publicDir: path.resolve(here, "public"),
  plugins: [
    {
      name: "codex-workbench-middleware",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          registerWorkbenchMiddleware(req, res, next);
        });
      },
    },
  ],
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5176,
    strictPort: true,
  },
});
