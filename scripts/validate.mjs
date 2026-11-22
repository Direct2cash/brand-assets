import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAX_BYTES = 150 * 1024;
const MAX_DIMENSION = 512;
const errors = [];

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const manifests = [
  { name: "banks", entries: read("banks/manifest.json"), key: "code" },
  { name: "bills", entries: read("bills/manifest.json"), key: "slug" },
  { name: "coins", entries: read("coins/manifest.json"), key: "symbol" },
];

const referenced = new Set();

for (const { name, entries, key } of manifests) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry[key])) errors.push(`${name}: duplicate ${key} ${entry[key]}`);
    seen.add(entry[key]);
    if (!entry.file) continue;

    referenced.add(entry.file);
    if (!fs.existsSync(entry.file)) {
      errors.push(`${name}: missing file ${entry.file}`);
      continue;
    }
    if (path.extname(entry.file) !== ".png") errors.push(`${name}: ${entry.file} is not png`);

    const size = fs.statSync(entry.file).size;
    if (size > MAX_BYTES) errors.push(`${name}: ${entry.file} is ${Math.round(size / 1024)}KB`);

    const meta = await sharp(entry.file).metadata();
    if ((meta.width || 0) > MAX_DIMENSION || (meta.height || 0) > MAX_DIMENSION) {
      errors.push(`${name}: ${entry.file} is ${meta.width}x${meta.height}`);
    }
  }
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

for (const dir of ["banks/ng", "bills", "coins"]) {
  for (const file of walk(dir)) {
    if (file.endsWith(".png") && !referenced.has(file)) errors.push(`orphan file ${file}`);
  }
}

const index = read("index.json");
for (const [code, entry] of Object.entries(index.banks)) {
  if (!fs.existsSync(entry.path)) errors.push(`index: bank ${code} -> ${entry.path} missing`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `ok: ${manifests.map(({ name, entries }) => `${entries.filter((e) => e.file).length} ${name}`).join(", ")}`
);
