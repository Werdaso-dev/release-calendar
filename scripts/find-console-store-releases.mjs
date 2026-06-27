import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = resolve(root, "data/releases.json");
const data = JSON.parse(await readFile(dataPath, "utf8"));
const existingNames = new Set((data.releases || []).map((release) => normalizeName(release.name)));
const existingUrls = new Set(
  (data.releases || [])
    .flatMap((release) => [release.sourceUrl, ...(release.sources || []).map((source) => source.url)])
    .filter(Boolean)
    .map(normalizeUrl),
);

const today = getDateParts(new Date(), "Europe/Moscow");
const todayKey = formatDateKey(today);
const requestTimeoutMs = Number(process.env.CONSOLE_STORE_TIMEOUT_MS || 10000);
const maxPlayStationPages = Number(process.env.PLAYSTATION_MAX_PRODUCTS || 36);
const maxNintendoPages = Number(process.env.NINTENDO_MAX_PRODUCTS || 40);

const stores = [];
stores.push(await collectPlayStation());
stores.push(await collectXbox());
stores.push(await collectNintendo());

const candidates = stores.flatMap((store) => store.candidates);

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      date: todayKey,
      stores: stores.map(({ candidates, ...store }) => ({ ...store, candidateCount: candidates.length })),
      candidateCount: candidates.length,
      candidates,
    },
    null,
    2,
  ),
);

async function collectPlayStation() {
  const store = {
    id: "playstation",
    name: "PlayStation Store",
    status: "ok",
    checkedRows: 0,
    candidates: [],
  };

  try {
    const latestUrl = "https://store.playstation.com/en-us/pages/latest";
    const latestHtml = await fetchText(latestUrl);
    const conceptUrls = [...new Set([...latestHtml.matchAll(/https:\/\/store\.playstation\.com\/en-us\/concept\/\d+|href="(\/en-us\/concept\/\d+)"/g)].map((match) => {
      const value = match[0].startsWith("http") ? match[0] : `https://store.playstation.com${match[1]}`;
      return value.replace(/^href="/, "");
    }))].slice(0, maxPlayStationPages);

    for (const url of conceptUrls) {
      const details = await readPlayStationProduct(url);
      store.checkedRows += 1;
      if (!details || details.date !== todayKey) continue;
      if (!isAddable(details)) continue;
      store.candidates.push(details);
    }
  } catch (error) {
    store.status = "failed";
    store.error = error.name || "FetchError";
  }

  return store;
}

async function readPlayStationProduct(url) {
  try {
    const html = await fetchText(url);
    const name = stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")
      .replace(/\s*\|\s*Official PlayStation.*$/i, "")
      .trim();
    const releaseDate = parseIsoDate((html.match(/"releaseDate":"([^"]+)"/) || [])[1]);
    const platforms = [...new Set([...html.matchAll(/"platforms":\[(.*?)\]/g)].flatMap((match) =>
      [...match[1].matchAll(/"([^"]+)"/g)].map((platform) => platform[1]),
    ))];
    const classification = (html.match(/"storeDisplayClassification":"([^"]+)"/) || [])[1] || "";
    const description = stripHtml((html.match(/"type":"SHORT","value":"([\s\S]*?)"/) || [])[1] || "");
    const image = decodeJsonString((html.match(/"role":"GAMEHUB_COVER_ART"[\s\S]*?"url":"([^"]+)"/) || [])[1] || "");

    if (!name || !releaseDate) return null;
    return {
      name,
      date: releaseDate,
      sourceUrl: url,
      releaseType: "game",
      platforms: [{ id: "playstation", name: "PlayStation" }],
      genres: ["Console"],
      description: description || `Новый релиз PlayStation Store: ${name}.`,
      image,
      sources: [{ name: "PlayStation Store", url, type: "store" }],
      store: "playstation",
      rawPlatforms: platforms,
      rawClassification: classification,
    };
  } catch {
    return null;
  }
}

async function collectXbox() {
  const store = {
    id: "xbox",
    name: "Xbox Store",
    status: "ok",
    checkedRows: 0,
    candidates: [],
  };

  try {
    const url = "https://www.xbox.com/en-US/games/all-games";
    const html = await fetchText(url);
    const state = parsePreloadedState(html);
    const summaries = state?.core2?.products?.productSummaries || findObjectByKey(state, "productSummaries") || {};
    const products = Object.values(summaries);

    for (const product of products) {
      store.checkedRows += 1;
      const releaseDate = parseIsoDate(product.releaseDate);
      if (releaseDate !== todayKey) continue;
      const name = product.title || product.productTitle || product.name;
      const productId = product.productId || product.id;
      const productKind = product.productKind || "";
      const availableOn = product.availableOn || [];
      const url = product.url || (productId ? `https://www.xbox.com/en-US/games/store/${productId}` : "https://www.xbox.com/en-US/games/all-games");
      const details = {
        name,
        date: releaseDate,
        sourceUrl: url,
        releaseType: "game",
        platforms: [{ id: "xbox", name: "Xbox" }],
        genres: (product.categories || []).slice(0, 3),
        description: stripHtml(product.shortDescription || product.description || "") || `Новый релиз Xbox Store: ${name}.`,
        image: product.imageUrl || product.posterImageUrl || product.productImageUrl || "",
        sources: [{ name: "Xbox Store", url, type: "store" }],
        store: "xbox",
        rawKind: productKind,
        rawAvailableOn: availableOn,
      };
      if (!isAddable(details)) continue;
      store.candidates.push(details);
    }
  } catch (error) {
    store.status = "failed";
    store.error = error.name || "FetchError";
  }

  return store;
}

async function collectNintendo() {
  const store = {
    id: "nintendo",
    name: "Nintendo eShop",
    status: "ok",
    checkedRows: 0,
    candidates: [],
  };

  try {
    const listUrl = "https://www.nintendo.com/us/store/games/?sort=df&f=corePlatforms&corePlatforms=Nintendo%20Switch";
    const html = await fetchText(listUrl);
    const urls = [...new Set([...html.matchAll(/href="(\/(?:us\/)?store\/products\/[^"#?]+\/?)"/g)]
      .map((match) => new URL(match[1], "https://www.nintendo.com").href)
      .filter((url) => !/switch-2/i.test(url)))]
      .slice(0, maxNintendoPages);

    for (const url of urls) {
      const details = await readNintendoProduct(url);
      store.checkedRows += 1;
      if (!details || details.date !== todayKey) continue;
      if (!isAddable(details)) continue;
      store.candidates.push(details);
    }
  } catch (error) {
    store.status = "failed";
    store.error = error.name || "FetchError";
  }

  return store;
}

async function readNintendoProduct(url) {
  try {
    const html = await fetchText(url);
    const name = stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")
      .replace(/\s*-\s*Nintendo Official Site.*$/i, "")
      .replace(/\s*for Nintendo Switch.*$/i, "")
      .trim();
    const releaseDate = parseIsoDate((html.match(/"releaseDate":"([^"]+)"/) || [])[1]);
    const platformLabel = decodeJsonString((html.match(/"platform":\{"__typename":"Platform","label":"([^"]+)"/) || [])[1] || "");
    const publisher = decodeJsonString((html.match(/"softwarePublisher":"([^"]+)"/) || [])[1] || "");
    const imagePublicId = (html.match(/"productImage":\{"__typename":"CloudinaryAsset","publicId":"([^"]+)"/) || [])[1] || "";
    const image = imagePublicId ? `https://assets.nintendo.com/image/upload/f_auto/q_auto/${imagePublicId}` : "";

    if (!name || !releaseDate || platformLabel !== "Nintendo Switch") return null;
    return {
      name,
      date: releaseDate,
      sourceUrl: url,
      releaseType: "game",
      platforms: [{ id: "switch", name: "Nintendo Switch" }],
      genres: ["Nintendo Switch"],
      description: publisher ? `Релиз для Nintendo Switch от ${publisher}.` : `Новый релиз Nintendo eShop для Nintendo Switch: ${name}.`,
      image,
      sources: [{ name: "Nintendo eShop", url, type: "store" }],
      store: "nintendo",
      rawPlatform: platformLabel,
    };
  } catch {
    return null;
  }
}

function isAddable(candidate) {
  if (!candidate.name || !candidate.date || !candidate.sourceUrl) return false;
  if (existingNames.has(normalizeName(candidate.name))) return false;
  if (existingUrls.has(normalizeUrl(candidate.sourceUrl))) return false;
  if (looksLikeAdditionalContent(candidate.name, candidate.description, candidate.sourceUrl)) return false;
  return true;
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url, requestTimeoutMs);
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 game-release-calendar-console-monitor" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parsePreloadedState(html) {
  const marker = "window.__PRELOADED_STATE__";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = html.indexOf("{", markerIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const character = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(start, index + 1));
      }
    }
  }

  return null;
}

function findObjectByKey(value, key) {
  if (!value || typeof value !== "object") return null;
  if (Object.hasOwn(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findObjectByKey(child, key);
    if (found) return found;
  }
  return null;
}

function parseIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function getDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value),
    day: Number(parts.find((part) => part.type === "day").value),
  };
}

function formatDateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").trim();
}

function normalizeUrl(value) {
  return String(value || "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

function looksLikeAdditionalContent(...parts) {
  const text = parts.join(" ").toLowerCase();
  return [
    /\bdlc\b/,
    /\badd[- ]?on\b/,
    /\bexpansion\b/,
    /\bseason pass\b/,
    /\bsupporter\b/,
    /\bpack\b/,
    /\bcostume\b/,
    /\bskin\b/,
    /\bsoundtrack\b/,
    /\bartbook\b/,
    /\bdemo\b/,
    /\bbeta\b/,
    /дополнени[ея]/,
    /демо/,
    /саундтрек/,
    /костюм/,
    /набор/,
    /пакет/,
    /аксессуар/,
  ].some((pattern) => pattern.test(text));
}

function stripHtml(value) {
  return decodeJsonString(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeJsonString(value) {
  return String(value || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\\\\/g, "\\");
}
