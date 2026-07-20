import { renameSync, statSync } from "node:fs";
import path from "node:path";

const distDirectory = path.resolve("dist");
const source = path.join(distDirectory, "freysa_head_arkit_cloudflare.glb");
const destination = path.join(distDirectory, "freysa_head_arkit.glb");
const cloudflareLimit = 25 * 1024 * 1024;
const size = statSync(source).size;

if (size > cloudflareLimit) {
  throw new Error(`Optimized avatar is still larger than Cloudflare's 25 MiB limit: ${size} bytes`);
}

renameSync(source, destination);
console.log(`Cloudflare avatar ready: ${(size / 1024 / 1024).toFixed(2)} MiB`);
