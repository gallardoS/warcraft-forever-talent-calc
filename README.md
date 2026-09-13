# Warcraft Forever tools

A minimal, data-first talent calculator and reference for races, class combinations, racials, and new class abilities.

## Editing talent trees

Each tree lives in its own YAML file under `data/talents/<class>/`. Talent IDs are stable keys; names and descriptions can change freely. Positions use a seven-row, four-column grid.

After editing data, run:

```powershell
node scripts/build-data.mjs
```

The build validates duplicate IDs and positions, rank descriptions, coordinates, prerequisites, and the expected three-tree class structure. It then writes the browser-ready files to `dist/data/`.

Race and ability source data live in `data/races.json` and `data/abilities.json`. Everything displayed by the product is written in English.

## Local preview

Serve the `dist` directory with any static HTTP server. Opening `dist/index.html` directly will not load the data because browsers block local fetch requests.
