# Календарь релизов игр

Публичная ссылка:

```text
https://werdaso-dev.github.io/release-calendar/
```

Личный публичный сайт-календарь будущих релизов PC, PlayStation, Xbox и Nintendo Switch. Его можно открыть локально, опубликовать на Netlify или GitHub Pages и отправить ссылку другу.

Основной календарь читает `data/releases.json`. В него попадают только релизы, подтвержденные официальными страницами, магазинами или игровыми СМИ. Wikipedia допустима только как дополнительный источник.

Если у игры нет надежной внешней обложки, сборка создает локальную SVG-карточку в `assets/generated-artwork/`. Поэтому опубликованный сайт не остается с пустыми рамками, даже если внешний CDN не загрузился. Обложки пересоздаются автоматически при `npm run build`; вручную их можно обновить командой `npm run generate:artwork`.

## Быстрый локальный запуск

```bash
npm run serve
```

Откройте:

```text
http://localhost:4173
```

## Публичная ссылка через Netlify

1. Создайте новый GitHub-репозиторий и загрузите в него содержимое этой папки.
2. Откройте Netlify: https://app.netlify.com/start
3. Выберите импорт сайта из GitHub.
4. В настройках сборки Netlify подхватит `netlify.toml`:
   - build command: `npm run validate && npm run build`
   - publish directory: `dist`
5. После деплоя Netlify выдаст публичную ссылку вида:

```text
https://your-site-name.netlify.app
```

Эту ссылку можно отправлять другу.

## Публичная ссылка через GitHub Pages

1. Создайте GitHub-репозиторий и загрузите в него содержимое этой папки.
2. В репозитории откройте Settings -> Pages.
3. В Source выберите GitHub Actions.
4. Workflow `.github/workflows/deploy-pages.yml` соберет сайт и опубликует его.
5. Ссылка будет выглядеть примерно так:

```text
https://your-github-name.github.io/repository-name/
```

## Как работают обновления

`data/releases.json` — проверенный календарь, который видят посетители сайта.

`data/candidate-releases.json` — ежедневный список кандидатов из RAWG. Он нужен, чтобы быстрее находить новые релизы, но не заменяет проверку источников. Nintendo Switch 2 в календарь намеренно не добавляется; для Nintendo берется только оригинальный Nintendo Switch.

Отдельно используется регулярный мониторинг магазинов: Steam, PlayStation Store, Microsoft Store / Xbox Store и Nintendo eShop для оригинального Nintendo Switch. Правила проверки описаны в `docs/daily-store-monitoring.md`. Игры и playable/content DLC добавляются в основной календарь только когда магазин или официальный источник явно показывает точную сегодняшнюю дату релиза и подходящую платформу.

Codex-автоматизация `Frequent game store release monitor` запускается каждые 2 часа, проверяет магазины и игровые СМИ, обновляет `data/releases.json`, пересобирает локальные карточки, делает commit и отправляет изменения в `origin/main`. После push GitHub Pages workflow публикует новую версию сайта.

Чтобы GitHub Actions каждый день обновлял список кандидатов:

1. Получите бесплатный ключ RAWG API: https://rawg.io/apidocs
2. В GitHub откройте Settings -> Secrets and variables -> Actions.
3. Добавьте secret:

```text
RAWG_API_KEY
```

После этого workflow `.github/workflows/update-releases.yml` будет каждый день обновлять `data/candidate-releases.json`.

Важно: основной календарь `data/releases.json` намеренно не заполняется автоматически из RAWG, чтобы не показывать другу неподтвержденные или перенесенные даты как факт. Новые игры нужно переносить из кандидатов в основной календарь после проверки даты в надежных источниках.

## Ручная проверка перед публикацией

```bash
npm run validate
npm run build
```

После сборки готовый сайт лежит в `dist/`.

## Как добавить игру в основной календарь

1. Найдите дату релиза в официальном источнике, магазине или надежном игровом СМИ.
2. Если есть сомнения или разные даты, ищите второе подтверждение и не добавляйте игру, пока конфликт не разрешен.
3. Добавьте игру в `data/releases.json` со статусом `verificationStatus: "verified"`. Для игр с несколькими независимыми подтверждениями можно использовать `triple_checked`.
4. Для точной даты используйте `datePrecision: "day"`.
5. Для окна релиза используйте `month`, `quarter`, `season`, `year` или `unknown`, добавьте текст в `dateLabel`, а в `date` поставьте дату-якорь для календаря.
6. Укажите `sources`; Wikipedia не должна быть единственным источником.
7. Укажите `releaseType`: `"game"` для полноценной игры или `"dlc"` для DLC/расширения.
8. Запустите:

```bash
npm run validate
```
