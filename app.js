const state = {
  releases: [],
  filtered: [],
  currentMonth: startOfMonth(new Date()),
  platform: "all",
  genre: "all",
  search: "",
  confirmedOnly: false,
};

const els = {
  updateStatus: document.querySelector("#updateStatus"),
  releaseCount: document.querySelector("#releaseCount"),
  visibleCount: document.querySelector("#visibleCount"),
  calendarGrid: document.querySelector("#calendarGrid"),
  releaseList: document.querySelector("#releaseList"),
  monthTitle: document.querySelector("#monthTitle"),
  searchInput: document.querySelector("#searchInput"),
  genreSelect: document.querySelector("#genreSelect"),
  confirmedOnly: document.querySelector("#confirmedOnly"),
  segments: document.querySelectorAll(".segment"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  todayButton: document.querySelector("#todayButton"),
  dayModal: document.querySelector("#dayModal"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  modalClose: document.querySelector("#modalClose"),
  modalTitle: document.querySelector("#modalTitle"),
  modalBody: document.querySelector("#modalBody"),
  releaseTemplate: document.querySelector("#releaseTemplate"),
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

init();

async function init() {
  bindEvents();

  try {
    const response = await fetch("./data/releases.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.releases = normalizeReleases(payload.releases || []);
    state.currentMonth = getInitialMonth(state.releases);
    updateMeta(payload);
    fillGenres();
    applyFilters();
  } catch (error) {
    els.updateStatus.textContent = "Не удалось загрузить данные";
    els.releaseList.innerHTML = `<div class="empty-state">Файл данных пока недоступен. Проверьте data/releases.json или запустите ежедневное обновление.</div>`;
  }
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  els.genreSelect.addEventListener("change", (event) => {
    state.genre = event.target.value;
    applyFilters();
  });

  els.confirmedOnly.addEventListener("change", (event) => {
    state.confirmedOnly = event.target.checked;
    applyFilters();
  });

  els.segments.forEach((button) => {
    button.addEventListener("click", () => {
      els.segments.forEach((segment) => segment.classList.remove("is-active"));
      button.classList.add("is-active");
      state.platform = button.dataset.platform;
      applyFilters();
    });
  });

  els.prevMonth.addEventListener("click", () => {
    state.currentMonth = addMonths(state.currentMonth, -1);
    render();
  });

  els.nextMonth.addEventListener("click", () => {
    state.currentMonth = addMonths(state.currentMonth, 1);
    render();
  });

  els.todayButton.addEventListener("click", () => {
    state.currentMonth = startOfMonth(new Date());
    render();
  });

  els.modalBackdrop.addEventListener("click", closeDayModal);
  els.modalClose.addEventListener("click", closeDayModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.dayModal.classList.contains("is-open")) {
      closeDayModal();
    }
  });
}

function normalizeReleases(releases) {
  return releases
    .filter((release) => release.name && release.date)
    .map((release) => ({
      ...release,
      dateObject: parseLocalDate(release.date),
      platforms: release.platforms || [],
      genres: release.genres || [],
      sources: release.sources || [],
      dateLabel: release.dateLabel || "",
      datePrecision: release.datePrecision || "day",
    }))
    .filter(isVerifiedRelease)
    .filter((release) => !Number.isNaN(release.dateObject.getTime()))
    .sort((a, b) => a.dateObject - b.dateObject || a.name.localeCompare(b.name, "ru"));
}

function isVerifiedRelease(release) {
  const reliableSources = release.sources.filter((source) => ["official", "media", "store"].includes(source.type));
  return ["verified", "triple_checked"].includes(release.verificationStatus) && reliableSources.length >= 1;
}

function getInitialMonth(releases) {
  const today = new Date();
  const currentMonth = startOfMonth(today);
  const currentMonthEnd = addMonths(currentMonth, 1);
  const hasCurrentMonthRelease = releases.some(
    (release) => release.dateObject >= currentMonth && release.dateObject < currentMonthEnd,
  );

  if (hasCurrentMonthRelease) return currentMonth;

  const nextRelease = releases.find((release) => release.dateObject >= today) || releases[0];
  return nextRelease ? startOfMonth(nextRelease.dateObject) : currentMonth;
}

function updateMeta(payload) {
  const updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : null;
  const source = payload.sourceName || "источник";
  const dateText = updatedAt
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(updatedAt)
    : "дата неизвестна";

  els.updateStatus.textContent = `Обновлено: ${dateText} · ${source}`;
  els.releaseCount.textContent = `${state.releases.length} ${plural(state.releases.length, ["релиз", "релиза", "релизов"])}`;
}

function fillGenres() {
  const genres = [...new Set(state.releases.flatMap((release) => release.genres))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );

  for (const genre of genres) {
    const option = document.createElement("option");
    option.value = genre;
    option.textContent = genre;
    els.genreSelect.append(option);
  }
}

function applyFilters() {
  state.filtered = state.releases.filter((release) => {
    const platformMatch =
      state.platform === "all" || release.platforms.some((platform) => platform.id === state.platform);
    const genreMatch = state.genre === "all" || release.genres.includes(state.genre);
    const searchMatch = !state.search || release.name.toLowerCase().includes(state.search);
    const precisionMatch = !state.confirmedOnly || release.datePrecision === "day";
    return platformMatch && genreMatch && searchMatch && precisionMatch;
  });

  if (state.filtered.length) {
    const monthEnd = addMonths(state.currentMonth, 1);
    const hasCurrentMonthRelease = state.filtered.some(
      (release) => release.dateObject >= state.currentMonth && release.dateObject < monthEnd,
    );

    if (state.search || !hasCurrentMonthRelease) {
      state.currentMonth = startOfMonth(getBestVisibleRelease(state.filtered).dateObject);
    }
  }

  render();
}

function getBestVisibleRelease(releases) {
  const today = new Date();
  return releases.find((release) => release.dateObject >= today) || releases[0];
}

function render() {
  els.monthTitle.textContent = capitalize(monthFormatter.format(state.currentMonth));
  els.visibleCount.textContent = state.filtered.length;
  renderCalendar();
  renderList();
}

function renderCalendar() {
  els.calendarGrid.innerHTML = "";
  const monthStart = startOfMonth(state.currentMonth);
  const gridStart = startOfWeekMonday(monthStart);
  const todayKey = formatDateKey(new Date());

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const key = formatDateKey(date);
    const isCurrentMonth = date.getMonth() === monthStart.getMonth();
    const dayReleases = isCurrentMonth ? state.filtered.filter((release) => release.date === key) : [];
    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (!isCurrentMonth) cell.classList.add("is-muted");
    if (key === todayKey) cell.classList.add("is-today");
    if (dayReleases.length) {
      cell.classList.add("has-releases");
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", `Показать релизы на ${dateFormatter.format(date)}`);
      cell.addEventListener("click", () => openDayModal(date, dayReleases));
      cell.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDayModal(date, dayReleases);
        }
      });
    }

    const heading = document.createElement("div");
    heading.className = "day-number";
    heading.innerHTML = `<span>${date.getDate()}</span>${dayReleases.length ? `<span class="day-count">${dayReleases.length}</span>` : ""}`;
    cell.append(heading);

    for (const release of dayReleases.slice(0, 3)) {
      const button = document.createElement("button");
      const primaryPlatform = release.platforms[0]?.id || "pc";
      button.className = `day-release day-release--${primaryPlatform}`;
      button.type = "button";
      button.textContent = release.name;
      button.title = release.name;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openDayModal(date, dayReleases);
      });
      cell.append(button);
    }

    if (dayReleases.length > 3) {
      const more = document.createElement("div");
      more.className = "more-indicator";
      more.textContent = `+${dayReleases.length - 3}`;
      cell.append(more);
    }

    els.calendarGrid.append(cell);
  }
}

function openDayModal(date, releases) {
  els.modalTitle.textContent = capitalize(dateFormatter.format(date));
  els.modalBody.innerHTML = "";

  for (const release of releases) {
    els.modalBody.append(createReleaseCard(release, { includeDate: false }));
  }

  els.dayModal.classList.add("is-open");
  els.dayModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-modal-open");
  els.modalClose.focus();
}

function closeDayModal() {
  els.dayModal.classList.remove("is-open");
  els.dayModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-modal-open");
}

function renderList() {
  els.releaseList.innerHTML = "";
  const monthEnd = addMonths(state.currentMonth, 1);
  const visible = state.search
    ? state.filtered
    : state.filtered.filter((release) => release.dateObject >= state.currentMonth && release.dateObject < monthEnd);

  if (!visible.length) {
    els.releaseList.innerHTML = state.search
      ? `<div class="empty-state">По этому запросу ничего не найдено. Попробуйте другое название или снимите часть фильтров.</div>`
      : `<div class="empty-state">Для выбранных фильтров в этом месяце релизов нет.</div>`;
    return;
  }

  for (const release of visible) {
    els.releaseList.append(createReleaseCard(release));
  }
}

function createReleaseCard(release, options = {}) {
  const { includeDate = true } = options;
  const node = els.releaseTemplate.content.firstElementChild.cloneNode(true);
  const media = node.querySelector(".release-card__media");
  const image = node.querySelector(".release-card__image");
  const fallback = node.querySelector(".release-card__fallback");
  node.id = includeDate ? `release-${release.id}` : "";
  node.querySelector("h3").textContent = release.name;
  node.querySelector(".release-card__date").textContent = includeDate
    ? `${formatReleaseDate(release)}${release.datePrecision !== "day" ? " · дата может уточняться" : ""}`
    : release.datePrecision !== "day"
      ? `Дата может уточняться: ${formatReleaseDate(release)}`
      : "Точная дата";
  node.querySelector(".release-card__description").textContent =
    release.description || "Краткое описание пока не добавлено.";
  fallback.textContent = getInitials(release.name);

  const generatedArtworkUrl = getGeneratedArtworkUrl(release);
  const artworkUrl = release.imageUrl || generatedArtworkUrl;

  if (artworkUrl) {
    let isUsingGeneratedArtwork = artworkUrl === generatedArtworkUrl;
    let fallbackTimer;
    const useGeneratedArtworkOrFallback = () => {
      window.clearTimeout(fallbackTimer);

      if (!isUsingGeneratedArtwork && generatedArtworkUrl) {
        isUsingGeneratedArtwork = true;
        fallbackTimer = window.setTimeout(() => {
          if (!image.complete || image.naturalWidth === 0) {
            showImageFallback(media, image, fallback);
          }
        }, 1200);
        image.src = generatedArtworkUrl;
        return;
      }

      showImageFallback(media, image, fallback);
    };

    fallback.hidden = true;
    fallbackTimer = window.setTimeout(() => {
      if (!image.complete || image.naturalWidth === 0) {
        useGeneratedArtworkOrFallback();
      }
    }, 2500);
    image.addEventListener(
      "error",
      () => {
        useGeneratedArtworkOrFallback();
      }
    );
    image.addEventListener(
      "load",
      () => {
        window.clearTimeout(fallbackTimer);
        media.classList.add("release-card__media--image");
      },
      { once: true },
    );
    image.loading = "eager";
    image.decoding = "async";
    image.src = artworkUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
  } else {
    showImageFallback(media, image, fallback);
  }

  const tags = node.querySelector(".release-card__tags");
  for (const platform of release.platforms) {
    tags.append(makeTag(platform.name, `tag--${platform.id}`));
  }
  for (const genre of release.genres.slice(0, 2)) {
    tags.append(makeTag(genre));
  }
  if (release.datePrecision !== "day") {
    tags.append(makeTag("не точная дата", "tag--tentative"));
  }
  tags.append(makeTag(`${release.sources.length} ${plural(release.sources.length, ["источник", "источника", "источников"])}`, "tag--verified"));

  for (const source of release.sources) {
    const link = document.createElement("a");
    link.className = "tag tag--source";
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = source.name;
    tags.append(link);
  }

  if (!release.sources.length && release.sourceUrl) {
    const link = document.createElement("a");
    link.className = "tag";
    link.href = release.sourceUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "источник";
    tags.append(link);
  }

  return node;
}

function focusRelease(id) {
  const card = document.querySelector(`#release-${CSS.escape(id)}`);
  if (!card) return;
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  card.animate(
    [
      { backgroundColor: "#fff3d6" },
      { backgroundColor: "#ffffff" },
    ],
    { duration: 900, easing: "ease-out" },
  );
}

function makeTag(text, modifier = "") {
  const tag = document.createElement("span");
  tag.className = `tag ${modifier}`.trim();
  tag.textContent = text;
  return tag;
}

function showImageFallback(media, image, fallback) {
  image.remove();
  fallback.hidden = false;
  media.classList.add("release-card__media--fallback");
}

function getGeneratedArtworkUrl(release) {
  return release.id ? `./assets/generated-artwork/${encodeURIComponent(release.id)}.svg` : "";
}

function getInitials(name) {
  return name
    .split(/[\s:'-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatReleaseDate(release) {
  return release.datePrecision === "day" ? dateFormatter.format(release.dateObject) : release.dateLabel || dateFormatter.format(release.dateObject);
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeekMonday(date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function plural(count, forms) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
