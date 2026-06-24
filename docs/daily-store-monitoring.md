# Daily Store Monitoring

Every morning, check new releases for the current date in the user's timezone, Europe/Moscow.

## Stores to check

- Steam
- PlayStation Store
- Microsoft Store / Xbox Store
- Nintendo eShop for the original Nintendo Switch only

Do not add Nintendo Switch 2 releases unless the same source also explicitly lists the original Nintendo Switch.

## What counts as addable

Add a game to `data/releases.json` only when all of these are true:

1. The game has a store or official page with an exact release date matching today's date.
2. The platform is one of: PC, PlayStation, Xbox, Nintendo Switch.
3. The listing is a full game release, not only DLC, soundtrack, demo, beta, preorder page, trailer, bundle-only sale, or patch.
4. The title is not already in `data/releases.json`.
5. The date/platform/title are not contradicted by another reliable source.

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

After editing:

```bash
npm run validate
npm run build
git add data/releases.json assets/generated-artwork app.js package.json README.md scripts docs
git commit -m "Add daily store releases"
git push
```

If no new verified releases are found, do not change the site.
