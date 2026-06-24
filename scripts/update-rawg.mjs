import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_KEY = process.env.RAWG_API_KEY;
const MONTHS_AHEAD = Number(process.env.MONTHS_AHEAD || 18);
const PAGE_SIZE = 40;
const MAX_PAGES = 10;
const PC_PARENT_PLATFORM = "1";
const PLAYSTATION_PARENT_PLATFORM = "2";
const XBOX_PARENT_PLATFORM = "3";
const SWITCH_PLATFORM = "7";
const SOURCE_NAME = "RAWG API";
const SOURCE_URL = "https://rawg.io/apidocs";

if (!API_KEY) {
  console.error("RAWG_API_KEY is required. Get a free key at https://rawg.io/apidocs");
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = resolve(root, "data/candidate-releases.json");

const today = new Date();
const from = toDateKey(today);
const until = toDateKey(addMonths(today, MONTHS_AHEAD));
const releases = new Map();

const queries = [
  { param: "parent_platforms", value: PC_PARENT_PLATFORM },
  { param: "parent_platforms", value: PLAYSTATION_PARENT_PLATFORM },
  { param: "parent_platforms", value: XBOX_PARENT_PLATFORM },
  { param: "platforms", value: SWITCH_PLATFORM },
];

for (const query of queries) {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", API_KEY);
    url.searchParams.set("dates", `${from},${until}`);
    url.searchParams.set(query.param, query.value);
    url.searchParams.set("ordering", "released");
    url.searchParams.set("page_size", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`RAWG request failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    for (const game of payload.results || []) {
      if (!game.released || game.tba) continue;
      mergeGame(releases, game);
    }

    if (!payload.next) break;
  }
}

const payload = {
  updatedAt: new Date().toISOString(),
  sourceName: SOURCE_NAME,
  sourceUrl: SOURCE_URL,
  platforms: ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
  range: { from, until },
  note:
    "Это список кандидатов из RAWG. Он не должен напрямую попадать в основной календарь: перед добавлением в data/releases.json дату нужно подтвердить минимум тремя независимыми источниками.",
  releases: [...releases.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Saved ${payload.releases.length} candidate releases to ${outputPath}`);

function mergeGame(store, game) {
  const existing = store.get(String(game.id));
  const platforms = mapPlatforms(game.parent_platforms || [], game.platforms || []);
  const release = {
    id: String(game.id),
    name: game.name,
    slug: game.slug,
    date: game.released,
    datePrecision: "day",
    platforms,
    genres: (game.genres || []).map((genre) => genre.name).filter(Boolean),
    sourceUrl: game.slug ? `https://rawg.io/games/${game.slug}` : SOURCE_URL,
  };

  if (!existing) {
    store.set(release.id, release);
    return;
  }

  const platformMap = new Map([...existing.platforms, ...platforms].map((platform) => [platform.id, platform]));
  existing.platforms = [...platformMap.values()];
}

function mapPlatforms(parentPlatforms, platforms) {
  const mapped = [];
  for (const item of parentPlatforms) {
    const id = String(item.platform?.id || "");
    if (id === PC_PARENT_PLATFORM) mapped.push({ id: "pc", name: "PC" });
    if (id === PLAYSTATION_PARENT_PLATFORM) mapped.push({ id: "playstation", name: "PlayStation" });
    if (id === XBOX_PARENT_PLATFORM) mapped.push({ id: "xbox", name: "Xbox" });
  }

  for (const item of platforms) {
    const id = String(item.platform?.id || "");
    if (id === SWITCH_PLATFORM) mapped.push({ id: "switch", name: "Nintendo Switch" });
  }

  return [...new Map(mapped.map((platform) => [platform.id, platform])).values()];
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
