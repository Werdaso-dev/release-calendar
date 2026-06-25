# Daily Store Monitoring

Every morning, check new releases for the current date in the user's timezone, Europe/Moscow.

## Stores to check

- Steam
- PlayStation Store
- Microsoft Store / Xbox Store
- Nintendo eShop for the original Nintendo Switch only
- Established games media when store browsing is incomplete: Gematsu, GamesRadar, TechRadar, Nintendo Life, Push Square, Pure Xbox, PC Gamer, Rock Paper Shotgun

Do not add Nintendo Switch 2 releases unless the same source also explicitly lists the original Nintendo Switch.

## What counts as addable

Add a release to `data/releases.json` only when all of these are true:

1. The game or DLC has a store or official page with an exact release date matching today's date.
2. The platform is one of: PC, PlayStation, Xbox, Nintendo Switch.
3. The listing is a full game or a playable/content DLC, expansion, character pack, story pack, map pack, or major add-on.
4. The title is not already in `data/releases.json`.
5. The date/platform/title are not contradicted by another reliable source.

Do not add soundtrack-only releases, art books, demos, beta tests, preorder-only pages, trailers, currency packs, cosmetic-only bundles, hardware items, or patches.

For Steam, do not rely only on the visible release date text. Steam can show a previous calendar day depending on region/timezone while the game appears in today's new releases for Europe/Moscow. When this happens, treat the release as today's Moscow-date release if the app is no longer coming soon, appears in Steam's current new releases, and Steam news/store metadata confirms a launch or launch sale around today's date.

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
- `"dlc"` for DLC, expansions, character packs, story packs, map packs, and other playable/content add-ons

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

Codex has a daily cron automation named `Daily game store release monitor`. It runs at 09:00 Europe/Moscow in this repository and must independently:

1. Check today's exact-date releases without waiting for a user prompt.
2. Add verified games and playable/content DLC to `data/releases.json`.
3. Rebuild generated artwork.
4. Commit and push changes to `origin/main` so GitHub Pages deploys the updated site.
5. Leave the repository unchanged when nothing reliable is found.
