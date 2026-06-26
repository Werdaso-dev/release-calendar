import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = resolve(root, "data/releases.json");
const data = JSON.parse(await readFile(dataPath, "utf8"));
const today = startOfDay(getDateInTimeZone(new Date(), "Europe/Moscow"));
const maxFutureReleases = Number(process.env.FUTURE_CHECK_LIMIT || 80);
const sourceTimeoutMs = Number(process.env.FUTURE_CHECK_TIMEOUT_MS || 8000);

const futureReleases = (data.releases || [])
  .filter((release) => release.datePrecision === "day")
  .map((release) => ({ ...release, dateObject: parseLocalDate(release.date) }))
  .filter((release) => release.dateObject > today)
  .sort((a, b) => a.dateObject - b.dateObject || a.name.localeCompare(b.name, "ru"))
  .slice(0, maxFutureReleases);

const checks = [];

for (const release of futureReleases) {
  const result = {
    id: release.id,
    name: release.name,
    currentDate: release.date,
    sourcesChecked: 0,
    status: "unchanged",
    signals: [],
  };

  const sources = getUniqueSources(release);
  for (const source of sources) {
    const signal = await checkSource(source, release);
    result.signals.push(signal);
    if (signal.status !== "unavailable") result.sourcesChecked += 1;
  }

  const sourceDates = result.signals
    .filter((signal) => signal.status === "ok")
    .flatMap((signal) => signal.dates)
    .filter((date) => date !== release.date);

  if (sourceDates.length) {
    result.status = "review_date_change";
    result.suggestedDates = [...new Set(sourceDates)];
  } else if (result.signals.some((signal) => signal.status === "needs_review")) {
    result.status = "review_source_text";
  } else if (!result.sourcesChecked) {
    result.status = "review_no_sources_reached";
  }

  checks.push(result);
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      date: formatDateKey(today),
      futureReleaseCount: futureReleases.length,
      reviewCount: checks.filter((check) => check.status !== "unchanged").length,
      checks,
    },
    null,
    2,
  ),
);

async function checkSource(source, release) {
  if (isSteamSource(source.url)) {
    return checkSteamSource(source, release);
  }

  return checkWebSource(source, release);
}

async function checkSteamSource(source, release) {
  const appid = getSteamAppId(source.url);
  const signal = {
    name: source.name,
    url: source.url,
    type: source.type,
    status: "unavailable",
    dates: [],
  };

  if (!appid) return signal;

  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", appid);
  url.searchParams.set("filters", "basic,release_date");
  url.searchParams.set("l", "russian");
  url.searchParams.set("cc", "RU");

  try {
    const response = await fetchWithTimeout(url, sourceTimeoutMs);
    if (!response.ok) return signal;
    const json = await response.json();
    const details = json[appid]?.success ? json[appid].data : null;
    const parsed = parseLooseDate(details?.release_date?.date);
    signal.status = parsed ? "ok" : "needs_review";
    signal.rawDate = details?.release_date?.date || "";
    signal.comingSoon = Boolean(details?.release_date?.coming_soon);
    signal.dates = parsed ? [parsed] : [];
  } catch (error) {
    signal.error = error.name || "FetchError";
  }

  return signal;
}

async function checkWebSource(source, release) {
  const signal = {
    name: source.name,
    url: source.url,
    type: source.type,
    status: "unavailable",
    dates: [],
  };

  try {
    const response = await fetchWithTimeout(source.url, sourceTimeoutMs);
    if (!response.ok) return signal;

    const html = await response.text();
    const text = stripHtml(html).slice(0, 120000);
    const currentDateText = formatReadableDate(release.dateObject);
    const releaseNameAppears = text.toLowerCase().includes(release.name.toLowerCase());
    const currentDateAppears = text.includes(release.date) || text.toLowerCase().includes(currentDateText.toLowerCase());
    const dates = extractDateCandidates(text);

    signal.status = currentDateAppears ? "ok" : releaseNameAppears || dates.length ? "needs_review" : "ok";
    signal.dates = dates.filter((date) => date !== release.date).slice(0, 5);
    signal.currentDateAppears = currentDateAppears;
    signal.releaseNameAppears = releaseNameAppears;
  } catch (error) {
    signal.error = error.name || "FetchError";
  }

  return signal;
}

function getUniqueSources(release) {
  const byUrl = new Map();
  for (const source of [...(release.sources || []), release.sourceUrl ? { name: "sourceUrl", url: release.sourceUrl, type: "source" } : null]) {
    if (!source?.url || byUrl.has(source.url)) continue;
    byUrl.set(source.url, source);
  }
  return [...byUrl.values()];
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 game-release-calendar-future-check" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractDateCandidates(text) {
  const dates = new Set();
  const patterns = [
    /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g,
    /\b([A-Z][a-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b/g,
    /\b(\d{1,2})\s+([A-Z][a-z]+)\s+(20\d{2})\b/g,
    /\b(\d{1,2})\s+([а-яё]+)\s+(20\d{2})\b/gi,
  ];

  for (const match of text.matchAll(patterns[0])) {
    dates.add(toDateKey(Number(match[1]), Number(match[2]), Number(match[3])));
  }

  for (const match of text.matchAll(patterns[1])) {
    const month = englishMonth(match[1]);
    if (month) dates.add(toDateKey(Number(match[3]), month, Number(match[2])));
  }

  for (const match of text.matchAll(patterns[2])) {
    const month = englishMonth(match[2]);
    if (month) dates.add(toDateKey(Number(match[3]), month, Number(match[1])));
  }

  for (const match of text.matchAll(patterns[3])) {
    const month = russianMonth(match[2]);
    if (month) dates.add(toDateKey(Number(match[3]), month, Number(match[1])));
  }

  return [...dates].filter(Boolean);
}

function parseLooseDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return toDateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const englishMonthFirst = text.match(/\b([A-Z][a-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (englishMonthFirst) {
    return toDateKey(Number(englishMonthFirst[3]), englishMonth(englishMonthFirst[1]), Number(englishMonthFirst[2]));
  }

  const englishDayFirst = text.match(/\b(\d{1,2})\s+([A-Z][a-z]+)\s+(20\d{2})\b/);
  if (englishDayFirst) {
    return toDateKey(Number(englishDayFirst[3]), englishMonth(englishDayFirst[2]), Number(englishDayFirst[1]));
  }

  const russian = text.match(/\b(\d{1,2})\s+([а-яё]+)\.?\s+(20\d{2})\b/i);
  if (russian) return toDateKey(Number(russian[3]), russianMonth(russian[2]), Number(russian[1]));

  return "";
}

function isSteamSource(url) {
  return /store\.steampowered\.com\/app\/\d+/.test(String(url));
}

function getSteamAppId(url) {
  return (String(url).match(/store\.steampowered\.com\/app\/(\d+)/) || [])[1] || "";
}

function parseLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return new Date(
    Number(parts.find((part) => part.type === "year").value),
    Number(parts.find((part) => part.type === "month").value) - 1,
    Number(parts.find((part) => part.type === "day").value),
  );
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date) {
  return toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function toDateKey(year, month, day) {
  if (!year || !month || !day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatReadableDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
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
  }[String(value).toLowerCase()];
}

function russianMonth(value) {
  const key = String(value).toLowerCase().replace(/\.$/, "");
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

function stripHtml(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
