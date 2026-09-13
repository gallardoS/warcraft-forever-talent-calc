import fs from "node:fs";
import path from "node:path";

const enabled = (name) => String(process.env[name] || "").toLowerCase() === "true";
const features = {
  editor: enabled("EDITOR_ENABLED"),
  races: enabled("RACES_ENABLED"),
  abilities: enabled("ABILITIES_ENABLED")
};

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync(
  path.join("dist", "config.js"),
  `window.APP_FEATURES = ${JSON.stringify(features, null, 2)};\n`
);
console.log(`Built feature flags: ${JSON.stringify(features)}`);
