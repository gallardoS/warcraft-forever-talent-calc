import fs from "node:fs";
import path from "node:path";

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function readTree(filePath) {
  const tree = { talents: [] };
  let talent = null;
  let section = null;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (indent === 0 && line !== "talents:") {
      const split = line.indexOf(":");
      tree[line.slice(0, split)] = scalar(line.slice(split + 1));
      continue;
    }
    if (indent === 2 && line.startsWith("- id:")) {
      talent = { id: scalar(line.slice(5)), descriptions: [] };
      tree.talents.push(talent);
      section = null;
      continue;
    }
    if (!talent) continue;
    if (indent === 4 && line === "requires:") {
      talent.requires = {};
      section = "requires";
      continue;
    }
    if (indent === 4 && line === "descriptions:") {
      section = "descriptions";
      continue;
    }
    if (indent === 4) {
      const split = line.indexOf(":");
      talent[line.slice(0, split)] = scalar(line.slice(split + 1));
      section = null;
      continue;
    }
    if (indent === 6 && section === "requires") {
      const split = line.indexOf(":");
      talent.requires[line.slice(0, split)] = scalar(line.slice(split + 1));
    } else if (indent === 6 && section === "descriptions" && line.startsWith("- ")) {
      talent.descriptions.push(scalar(line.slice(2)));
    }
  }
  return tree;
}

function validateTree(tree, filePath) {
  const requiredKeys = ["id", "classId", "name", "version", "status"];
  for (const key of requiredKeys) if (!tree[key]) throw new Error(`${filePath}: missing ${key}`);
  const ids = new Set();
  const positions = new Set();
  for (const talent of tree.talents) {
    if (ids.has(talent.id)) throw new Error(`${filePath}: duplicate talent id ${talent.id}`);
    ids.add(talent.id);
    const position = `${talent.row}:${talent.column}`;
    if (positions.has(position)) throw new Error(`${filePath}: duplicate position ${position}`);
    positions.add(position);
    if (talent.row < 1 || talent.row > 7 || talent.column < 1 || talent.column > 4) throw new Error(`${filePath}: invalid position for ${talent.id}`);
    if (talent.descriptions.length !== talent.maxRanks) throw new Error(`${filePath}: ${talent.id} has ${talent.descriptions.length} descriptions for ${talent.maxRanks} ranks`);
  }
  for (const talent of tree.talents) {
    if (talent.requires && !ids.has(talent.requires.talentId)) throw new Error(`${filePath}: ${talent.id} requires unknown talent ${talent.requires.talentId}`);
  }
}

const classDefinitions = JSON.parse(fs.readFileSync(path.join("data", "classes.json"), "utf8"));
const trees = [];
for (const classDefinition of classDefinitions) {
  const directory = path.join("data", "talents", classDefinition.id);
  for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith(".yaml"))) {
    const filePath = path.join(directory, filename);
    const tree = readTree(filePath);
    validateTree(tree, filePath);
    trees.push(tree);
  }
}

const output = { classes: classDefinitions.map(({ treeOrder, ...classDefinition }) => {
  const classTrees = trees.filter((tree) => tree.classId === classDefinition.id);
  if (classTrees.length !== 3) throw new Error(`${classDefinition.id}: expected 3 trees, found ${classTrees.length}`);
  classTrees.sort((a, b) => treeOrder.indexOf(a.id) - treeOrder.indexOf(b.id));
  return { ...classDefinition, trees: classTrees };
}) };

fs.mkdirSync(path.join("dist", "data"), { recursive: true });
fs.writeFileSync(path.join("dist", "data", "talents.json"), JSON.stringify(output));
fs.copyFileSync(path.join("data", "races.json"), path.join("dist", "data", "races.json"));
fs.copyFileSync(path.join("data", "abilities.json"), path.join("dist", "data", "abilities.json"));
console.log(`Validated and built ${trees.length} talent trees.`);
