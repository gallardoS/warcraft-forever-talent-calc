# Warcraft Forever tools

A minimal, data-first talent calculator and reference for races, class combinations, racials, and new class abilities.

## Editing talent trees

Each tree lives in its own YAML file under `data/talents/<class>/`. Talent IDs are stable keys; names and descriptions can change freely. Positions use a seven-row, four-column grid.

After editing data, run:

```powershell
node scripts/build-data.mjs
```

The build validates duplicate IDs and positions, rank descriptions, coordinates, prerequisites, and the expected three-tree class structure. It then writes the browser-ready files to `dist/data/`.

Talents can optionally define white tooltip metadata with `cost`, `range`, `castTime`, and `cooldown`. The `castTime` value can also be `Passive` or `Instant`.

Race and ability source data live in `data/races.json` and `data/abilities.json`. Everything displayed by the product is written in English.

## Local preview

Serve the `dist` directory with any static HTTP server. Opening `dist/index.html` directly will not load the data because browsers block local fetch requests.

## Feature flags and Vercel

The optional navigation sections are controlled at build time with environment variables. A section is visible only when its value is exactly `true` (case-insensitive):

- `EDITOR_ENABLED`
- `RACES_ENABLED`
- `ABILITIES_ENABLED`

After changing flags locally, run `npm run build`. On Vercel, add the variables to the desired environments and redeploy. Vercel runs the configured build and serves the `dist` directory automatically.

## Interface artwork

The classic talent-tree backgrounds in `dist/assets/talent-backgrounds/` are assembled from Blizzard's original interface textures. The matching reference gallery is available in [Wowpedia's talent interface backgrounds category](https://wowpedia.fandom.com/wiki/Category:Talents_interface_backgrounds), and the source texture mirror is [Gethe/wow-ui-textures](https://github.com/Gethe/wow-ui-textures/tree/live/TALENTFRAME).
