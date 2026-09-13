import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const referenceRoot = process.argv[2];
if (!referenceRoot) {
  throw new Error("Usage: node scripts/import-classic-data.mjs <reference-repository>");
}

const talentsSource = fs.readFileSync(path.join(referenceRoot, "src/data/talents.ts"), "utf8");
const spells = JSON.parse(fs.readFileSync(path.join(referenceRoot, "src/data/spells.json"), "utf8"));

function extractObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Missing marker: ${marker}`);
  const start = source.indexOf("{", markerIndex);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) {
      return vm.runInNewContext(`(${source.slice(start, i + 1)})`);
    }
  }
  throw new Error(`Unclosed object after: ${marker}`);
}

const specNames = extractObject(talentsSource, "export const specNames");
const talentsBySpec = extractObject(talentsSource, "export const talentsBySpec");

const classes = [
  { id: "warrior", name: "Warrior", color: "#c69b6d", specs: [161, 164, 163] },
  { id: "paladin", name: "Paladin", color: "#f48cba", specs: [382, 383, 381] },
  { id: "hunter", name: "Hunter", color: "#aad372", specs: [361, 363, 362] },
  { id: "rogue", name: "Rogue", color: "#fff468", specs: [182, 181, 183] },
  { id: "priest", name: "Priest", color: "#f4f4f4", specs: [201, 202, 203] },
  { id: "shaman", name: "Shaman", color: "#0070dd", specs: [261, 263, 262] },
  { id: "mage", name: "Mage", color: "#3fc7eb", specs: [81, 41, 61] },
  { id: "warlock", name: "Warlock", color: "#8788ee", specs: [302, 303, 301] },
  { id: "druid", name: "Druid", color: "#ff7c0a", specs: [283, 281, 282] }
];

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function yamlScalar(value) {
  return JSON.stringify(value ?? "");
}

function toYaml(tree) {
  const lines = [
    `id: ${yamlScalar(tree.id)}`,
    `classId: ${yamlScalar(tree.classId)}`,
    `name: ${yamlScalar(tree.name)}`,
    `version: ${yamlScalar(tree.version)}`,
    `status: ${yamlScalar(tree.status)}`,
    "talents:"
  ];
  for (const talent of tree.talents) {
    lines.push(`  - id: ${yamlScalar(talent.id)}`);
    lines.push(`    name: ${yamlScalar(talent.name)}`);
    lines.push(`    icon: ${yamlScalar(talent.icon)}`);
    lines.push(`    row: ${talent.row}`);
    lines.push(`    column: ${talent.column}`);
    lines.push(`    maxRanks: ${talent.maxRanks}`);
    if (talent.requires) {
      lines.push("    requires:");
      lines.push(`      talentId: ${yamlScalar(talent.requires.talentId)}`);
      lines.push(`      ranks: ${talent.requires.ranks}`);
    }
    lines.push("    descriptions:");
    for (const description of talent.descriptions) lines.push(`      - ${yamlScalar(description)}`);
  }
  return `${lines.join("\n")}\n`;
}

const output = { generatedAt: new Date().toISOString(), classes: [] };
for (const classEntry of classes) {
  const outputClass = { ...classEntry, trees: [] };
  delete outputClass.specs;
  for (const specId of classEntry.specs) {
    const specName = specNames[specId];
    const talentEntries = Object.values(talentsBySpec[specId]);
    const ids = new Map(talentEntries.map((talent) => [talent.id, slugify(spells[talent.ranks[0]]?.name || `talent-${talent.id}`)]));
    const tree = {
      id: `${classEntry.id}-${slugify(specName)}`,
      classId: classEntry.id,
      name: specName,
      version: "classic-1.12",
      status: "baseline",
      talents: talentEntries.map((talent) => ({
        id: ids.get(talent.id),
        name: spells[talent.ranks[0]]?.name || `Talent ${talent.id}`,
        icon: talent.icon,
        row: talent.row + 1,
        column: talent.col + 1,
        maxRanks: talent.ranks.length,
        descriptions: talent.ranks.map((rankId) => spells[rankId]?.description || "Description pending"),
        requires: talent.requires[0] ? { talentId: ids.get(talent.requires[0].id), ranks: talent.requires[0].qty } : undefined
      }))
    };
    outputClass.trees.push(tree);
    const yamlDirectory = path.join("data", "talents", classEntry.id);
    fs.mkdirSync(yamlDirectory, { recursive: true });
    fs.writeFileSync(path.join(yamlDirectory, `${slugify(specName)}.yaml`), toYaml(tree));
  }
  output.classes.push(outputClass);
}

fs.mkdirSync(path.join("dist", "data"), { recursive: true });
fs.writeFileSync(path.join("dist", "data", "talents.json"), JSON.stringify(output));
console.log(`Generated ${output.classes.length} classes, ${output.classes.reduce((sum, item) => sum + item.trees.length, 0)} trees and ${output.classes.flatMap((item) => item.trees).reduce((sum, item) => sum + item.talents.length, 0)} talents.`);
