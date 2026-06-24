import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./generate-artwork.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = resolve(root, "dist");

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });

for (const item of ["index.html", "styles.css", "app.js", "assets", "data"]) {
  await cp(resolve(root, item), resolve(dist, item), { recursive: true });
}

console.log(`Built static site in ${dist}`);
