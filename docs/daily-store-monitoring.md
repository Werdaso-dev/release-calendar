# Daily Store Monitoring

Check new releases repeatedly during the day for the current date in the user's timezone, Europe/Moscow.

## Stores to check

- Steam
- PlayStation Store
- Microsoft Store / Xbox Store
- Nintendo eShop for the original Nintendo Switch only
- Established games media when store browsing is incomplete: Gematsu, GamesRadar, TechRadar, Nintendo Life, Push Square, Pure Xbox, PC Gamer, Rock Paper Shotgun

Start with the fast monitor script:

```bash
node scripts/find-today-releases.mjs
```

This script checks Steam with timeouts and prints a small JSON list of candidates that are not already in `data/releases.json`. Use it as the first pass before doing any manual browsing.

For Steam, use the released-date search view:

```text
https://store.steampowered.com/search/?sort_by=Released_DESC&supportedlang=russian&os=mac%2Cwin%2Clinux&ndl=1
```

The monitor mirrors that view through Steam's search endpoint: Russian-supported games, Windows/macOS/Linux, newest releases first. Prefer the visible release date from the list before opening individual app pages.

Do not add Nintendo Switch 2 releases unless the same source also explicitly lists the original Nintendo Switch.

## What counts as addable

Add a release to `data/releases.json` only when all of these are true:

1. The game has a store or official page with an exact release date matching today's date.
2. The platform is one of: PC, PlayStation, Xbox, Nintendo Switch.
3. The listing is a full game.
4. The title is not already in `data/releases.json`.
5. The date/platform/title are not contradicted by another reliable source.

Do not add DLC, expansions, add-ons, soundtrack releases, art books, demos, beta tests, preorder-only pages, trailers, currency packs, cosmetic bundles, hardware items, or patches.

For small indie games, one official store page can be enough for the release date when the store clearly shows the exact date. When available, add a second source from the official site, publisher page, Gematsu, GamesRadar, TechRadar, Nintendo Life, Push Square, Pure Xbox, PC Gamer, Rock Paper Shotgun, or another established games outlet.

## How to add a release

Use `datePrecision: "day"` and set `date` to today's date in `YYYY-MM-DD`.

Use platform ids:

- `pc`
- `playstation`
- `xbox`
- `switch`

Use source types:

- `store` for Steam, PlayStation Store, Microsoft Store, Nintendo eShop
- `official` for developer/publisher pages
- `media` for games media

Write a short description that explains what the game is, without copying store text verbatim.

Set `releaseType`:

- `"game"` for full games

After editing:

```bash
node scripts/validate-releases.mjs
node scripts/build-site.mjs
git add data/releases.json assets/generated-artwork app.js package.json README.md scripts docs
git commit -m "Add daily store releases"
git push
```

If no new verified releases are found, do not change the site. In the run summary, report which stores and media sources were checked.

## Current automation

Codex has a cron automation named `Daily game store release monitor`. It runs once per day in this repository and must independently:

1. Check today's exact-date releases without waiting for a user prompt.
2. Add verified full games to `data/releases.json`.
3. Rebuild generated artwork.
4. Commit and push changes to `origin/main` so GitHub Pages deploys the updated site.
5. Leave the repository unchanged when nothing reliable is found.
