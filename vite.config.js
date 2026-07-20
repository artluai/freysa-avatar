import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { copyFile } from "node:fs/promises";

const embedSource = fileURLToPath(new URL("freysa-avatar-embed.js", import.meta.url));
const embedOutput = fileURLToPath(new URL("dist/freysa-avatar-embed.js", import.meta.url));

export default defineConfig({
  plugins: [{
    name: "copy-freysa-avatar-embed",
    async closeBundle() {
      await copyFile(embedSource, embedOutput);
    }
  }],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        history: fileURLToPath(new URL("history.html", import.meta.url))
      }
    }
  },
  server: {
    port: 5187,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
});
