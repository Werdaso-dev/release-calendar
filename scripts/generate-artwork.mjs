import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = resolve(root, "data/releases.json");
const outputDir = resolve(root, "assets/generated-artwork");
const data = JSON.parse(await readFile(dataPath, "utf8"));

await mkdir(outputDir, { recursive: true });

const releases = data.releases || [];
const expectedFiles = new Set(releases.map((release) => `${release.id}.svg`));

for (const file of await readdir(outputDir)) {
  if (file.endsWith(".svg") && !expectedFiles.has(file)) {
    await unlink(resolve(outputDir, file));
  }
}

for (const release of releases) {
  const svg = makeArtwork(release);
  await writeFile(resolve(outputDir, `${release.id}.svg`), svg);
}

console.log(`Generated ${releases.length} local artwork cards`);

function makeArtwork(release) {
  const theme = getTheme(release);
  const titleLines = wrapText(release.name, 20).slice(0, 4);
  const genre = release.genres?.[0] || "Game";
  const platforms = (release.platforms || []).map((platform) => shortPlatform(platform.id)).join(" / ");
  const date = formatDate(release);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="${escapeXml(release.name)} artwork">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${theme.dark}"/>
      <stop offset="0.55" stop-color="${theme.mid}"/>
      <stop offset="1" stop-color="${theme.light}"/>
    </linearGradient>
    <radialGradient id="flare" cx="72%" cy="24%" r="55%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.34"/>
    </filter>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect width="1280" height="720" fill="url(#flare)"/>
  <g opacity="0.16">
    <circle cx="1038" cy="120" r="220" fill="#ffffff"/>
    <circle cx="112" cy="656" r="260" fill="#ffffff"/>
    <path d="M-120 184 C150 90 344 312 614 212 C856 122 1012 68 1400 188 L1400 0 L-120 0 Z" fill="#ffffff"/>
  </g>
  <g filter="url(#shadow)">
    <rect x="70" y="72" width="1140" height="576" rx="34" fill="#10151d" fill-opacity="0.34" stroke="#ffffff" stroke-opacity="0.18"/>
  </g>
  <g transform="translate(104 110)">
    <text x="0" y="0" fill="#ffffff" fill-opacity="0.78" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="0">${escapeXml(genre.toUpperCase())}</text>
    ${titleLines
      .map(
        (line, index) =>
          `<text x="0" y="${102 + index * 78}" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="${titleLines.length > 3 ? 66 : 74}" font-weight="900" letter-spacing="0">${escapeXml(line)}</text>`,
      )
      .join("\n    ")}
  </g>
  <g transform="translate(104 586)">
    <rect x="0" y="-48" width="${Math.max(230, platforms.length * 18 + 46)}" height="58" rx="29" fill="#ffffff" fill-opacity="0.18" stroke="#ffffff" stroke-opacity="0.24"/>
    <text x="25" y="-11" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="850" letter-spacing="0">${escapeXml(platforms)}</text>
  </g>
  <g transform="translate(1176 586)" text-anchor="end">
    <text x="0" y="-12" fill="#ffffff" fill-opacity="0.86" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="850" letter-spacing="0">${escapeXml(date)}</text>
  </g>
</svg>
`;
}

function getTheme(release) {
  const text = `${release.name} ${(release.genres || []).join(" ")}`.toLowerCase();
  if (text.includes("horror") || text.includes("silent") || text.includes("hellraiser")) {
    return { dark: "#180f16", mid: "#5d1725", light: "#c53d43" };
  }
  if (text.includes("fighting") || text.includes("combat") || text.includes("wolverine")) {
    return { dark: "#10131c", mid: "#384268", light: "#d2a33b" };
  }
  if (text.includes("rpg") || text.includes("fable") || text.includes("persona")) {
    return { dark: "#10151f", mid: "#354d7f", light: "#8c5fb3" };
  }
  if (text.includes("sim") || text.includes("cozy") || text.includes("zoo")) {
    return { dark: "#102019", mid: "#27745c", light: "#c5a14d" };
  }
  if (text.includes("sci") || text.includes("star") || text.includes("halo")) {
    return { dark: "#0c1726", mid: "#1f5a7d", light: "#5dc0d0" };
  }
  if (text.includes("racing") || text.includes("ace combat")) {
    return { dark: "#111823", mid: "#345d7c", light: "#e17843" };
  }
  return { dark: "#15191f", mid: "#385164", light: "#c53d43" };
}

function wrapText(value, maxLength) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxLength || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function shortPlatform(id) {
  if (id === "playstation") return "PS";
  if (id === "xbox") return "Xbox";
  if (id === "switch") return "Switch";
  return "PC";
}

function formatDate(release) {
  if (release.datePrecision !== "day") return release.dateLabel || "TBA";
  const [year, month, day] = release.date.split("-");
  return `${day}.${month}.${year}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
