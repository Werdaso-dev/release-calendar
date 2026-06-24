import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = resolve(root, "data/releases.json");
const data = JSON.parse(await readFile(dataPath, "utf8"));
const REQUIRED_SOURCES = Number(data.verificationPolicy?.requiredSources || 1);
const errors = [];

for (const release of data.releases || []) {
  if (!release.id || !release.name || !release.date) {
    errors.push(`${release.id || release.name || "unknown"}: missing id, name, or date`);
    continue;
  }

  if (!["verified", "triple_checked"].includes(release.verificationStatus)) {
    errors.push(`${release.name}: verificationStatus must be "verified" or "triple_checked"`);
  }

  const sources = Array.isArray(release.sources) ? release.sources : [];
  if (sources.length < REQUIRED_SOURCES) {
    errors.push(`${release.name}: requires at least ${REQUIRED_SOURCES} sources`);
  }

  if (!sources.some((source) => ["official", "media", "store"].includes(source.type))) {
    errors.push(`${release.name}: needs at least one official, store, or games media source`);
  }

  const hostnames = new Set();
  for (const source of sources) {
    if (!source.name || !source.url) {
      errors.push(`${release.name}: each source needs name and url`);
      continue;
    }

    try {
      hostnames.add(new URL(source.url).hostname.replace(/^www\./, ""));
    } catch {
      errors.push(`${release.name}: invalid source URL "${source.url}"`);
    }
  }

  if (REQUIRED_SOURCES > 1 && hostnames.size < REQUIRED_SOURCES) {
    errors.push(`${release.name}: sources must come from at least ${REQUIRED_SOURCES} different domains`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${data.releases.length} verified releases`);
