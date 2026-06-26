import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = resolve(root, "data/releases.json");
const data = JSON.parse(await readFile(dataPath, "utf8"));
const existingNames = new Set((data.releases || []).map((release) => normalizeName(release.name)));
const existingSteamUrls = new Set(
  (data.releases || [])
    .flatMap((release) => [release.sourceUrl, ...(release.sources || []).map((source) => source.url)])
    .filter(Boolean)
    .map(normalizeSteamUrl),
);

const today = getDateParts(new Date(), "Europe/Moscow");
const maxRows = Number(process.env.STEAM_MAX_ROWS || 250);
const pageSize = 50;
const candidates = [];
const checked = [];

for (let start = 0; start < maxRows; start += pageSize) {
  const page = await fetchSteamSearchPage(start, pageSize);
  if (!page.length) break;

  let pageHasRelevantDates = false;
  for (const row of page) {
    checked.push(row);
    const parsedDate = parseSteamDate(row.dateText);
    const isToday = parsedDate && sameDate(parsedDate, today);
    if (isToday) pageHasRelevantDates = true;
    if (!isToday) continue;
    if (existingNames.has(normalizeName(row.title)) || existingSteamUrls.has(normalizeSteamUrl(row.url))) continue;
    if (looksLikeAdditionalContent(row.title, row.url)) continue;

    const details = await fetchSteamDetails(row.appid);
    if (details?.release_date?.coming_soon) continue;
    if (isAdditionalContent(details, row)) continue;

    candidates.push({
      name: details?.name || row.title,
      date: formatDateKey(today),
      steamVisibleDate: row.dateText,
      sourceUrl: cleanSteamUrl(row.url),
      releaseType: "game",
      platforms: [{ id: "pc", name: "PC" }],
      genres: mapGenres(details?.genres),
      description: makeDescription(details),
      sources: [{ name: "Steam", url: cleanSteamUrl(row.url), type: "store" }],
    });
  }

  if (!pageHasRelevantDates && start > 0) break;
}

const payload = {
  checkedAt: new Date().toISOString(),
  date: formatDateKey(today),
  checkedRows: checked.length,
  candidates,
};

console.log(JSON.stringify(payload, null, 2));

async function fetchSteamSearchPage(start, count) {
  const url = new URL("https://store.steampowered.com/search/results/");
  url.searchParams.set("query", "");
  url.searchParams.set("start", String(start));
  url.searchParams.set("count", String(count));
  url.searchParams.set("dynamic_data", "");
  url.searchParams.set("sort_by", "Released_DESC");
  url.searchParams.set("supportedlang", "russian");
  url.searchParams.set("os", "mac,win,linux");
  url.searchParams.set("category1", "998");
  url.searchParams.set("l", "russian");
  url.searchParams.set("cc", "RU");
  url.searchParams.set("infinite", "1");

  const response = await fetchWithTimeout(url, 8000);
  if (!response.ok) throw new Error(`Steam search failed: ${response.status}`);
  const json = await response.json();
  return parseSteamRows(json.results_html || "");
}

async function fetchSteamDetails(appid) {
  if (!appid) return null;
  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", appid);
  url.searchParams.set("filters", "basic,release_date,platforms,genres,short_description");
  url.searchParams.set("l", "russian");
  url.searchParams.set("cc", "RU");

  const response = await fetchWithTimeout(url, 8000);
  if (!response.ok) return null;
  const json = await response.json();
  return json[appid]?.success ? json[appid].data : null;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 game-release-calendar-monitor" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseSteamRows(html) {
  return html
    .split(/<a href=/)
    .slice(1)
    .map((block) => {
      const url = decodeHtml((block.match(/^"([^"]+)/) || [])[1] || "");
      const appid = (block.match(/data-ds-appid="([^"]+)/) || [])[1] || "";
      const title = stripHtml((block.match(/<span class="title">([\s\S]*?)<\/span>/) || [])[1] || "");
      const dateText = stripHtml(
        (block.match(/<div class="(?:col )?search_released responsive_secondrow">([\s\S]*?)<\/div>/) || [])[1] ||
          "",
      );
      return { appid, title, dateText, url: cleanSteamUrl(url) };
    })
    .filter((row) => row.appid && row.title && row.url);
}

function parseSteamDate(value) {
  const text = String(value).trim().toLowerCase();
  if (!text) return null;

  const english = text.match(/(\d{1,2})\s+([a-z]{3,}),?\s+(\d{4})/i);
  if (english) {
    return {
      year: Number(english[3]),
      month: englishMonth(english[2]),
      day: Number(english[1]),
    };
  }

  const russian = text.match(/(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4})/i);
  if (russian) {
    return {
      year: Number(russian[3]),
      month: russianMonth(russian[2]),
      day: Number(russian[1]),
    };
  }

  return null;
}

function englishMonth(value) {
  return {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  }[value.toLowerCase()];
}

function russianMonth(value) {
  const key = value.replace(/\.$/, "");
  return {
    янв: 1,
    января: 1,
    фев: 2,
    февраля: 2,
    мар: 3,
    марта: 3,
    апр: 4,
    апреля: 4,
    май: 5,
    мая: 5,
    июн: 6,
    июня: 6,
    июл: 7,
    июля: 7,
    авг: 8,
    августа: 8,
    сен: 9,
    сент: 9,
    сентября: 9,
    окт: 10,
    октября: 10,
    ноя: 11,
    ноября: 11,
    дек: 12,
    декабря: 12,
  }[key];
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

function sameDate(a, b) {
  return a?.year === b.year && a?.month === b.month && a?.day === b.day;
}

function formatDateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function normalizeName(value) {
  return String(value).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").trim();
}

function normalizeSteamUrl(value) {
  const match = String(value).match(/store\.steampowered\.com\/app\/(\d+)/);
  return match ? `steam:${match[1]}` : String(value);
}

function cleanSteamUrl(value) {
  const match = String(value).match(/^(https:\/\/store\.steampowered\.com\/app\/\d+\/[^/?#]*)/);
  return match ? `${match[1]}/` : String(value).replace(/&amp;/g, "&");
}

function mapGenres(genres = []) {
  const mapped = genres.map((genre) => genre.description).filter(Boolean);
  return [...new Set(mapped)].slice(0, 3);
}

function makeDescription(details) {
  const text = stripHtml(details?.short_description || "").trim();
  return text || "Описание будет уточнено по странице Steam.";
}

function isAdditionalContent(details, row) {
  const type = String(details?.type || "").toLowerCase();
  if (type && type !== "game") return true;

  const text = [
    details?.name,
    row?.title,
    details?.short_description,
    ...(details?.categories || []).map((category) => category.description),
    ...(details?.genres || []).map((genre) => genre.description),
  ]
    .filter(Boolean)
    .join(" ");

  return looksLikeAdditionalContent(text, row?.url);
}

function looksLikeAdditionalContent(value, url = "") {
  const text = `${value || ""} ${url || ""}`.toLowerCase();
  const additionalContentPatterns = [
    /\bdlc\b/,
    /\badd[- ]?on\b/,
    /\bexpansion\b/,
    /\bseason pass\b/,
    /\bupgrade pack\b/,
    /\bcontent pack\b/,
    /\bskin pack\b/,
    /\bcostume\b/,
    /\bcosmetic\b/,
    /\bbundle\b/,
    /\bsoundtrack\b/,
    /\bost\b/,
    /\bartbook\b/,
    /\bart book\b/,
    /\bwallpaper\b/,
    /\bavatar\b/,
    /\bcurrency\b/,
    /\bcoins?\b/,
    /\btokens?\b/,
    /\bcredits?\b/,
    /\bpoints?\b/,
    /\bdemo\b/,
    /\bplaytest\b/,
    /\bbeta\b/,
    /дополнени[ея]/,
    /загружаем(?:ый|ое|ая|ые) контент/,
    /саундтрек/,
    /набор .*скин/,
    /набор .*костюм/,
    /цифров(?:ой|ая|ое) артбук/,
  ];

  return additionalContentPatterns.some((pattern) => pattern.test(text));
}

function stripHtml(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
