import { mkdir, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { slugify } from "./lib/names.mjs";

const SOURCE = process.argv[2] || "../backend-api/src/core/services/billsService/constants/logos.ts";
const OUT_DIR = "bills";
const MANIFEST = "bills/manifest.json";
const MAX_SIZE = 256;

const TV = new Set(["startimes", "gotv", "dstv"]);

const fetchBuffer = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "simfy-brand-assets" } });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) return null;
  return Buffer.from(await response.arrayBuffer());
};

const parseMaps = (source) => {
  const entries = [];
  const blocks = [
    { name: "NETWORK_ICONS", category: "airtime" },
    { name: "PROVIDER_LOGOS", category: "provider" },
  ];

  for (const block of blocks) {
    const start = source.indexOf(`const ${block.name}`);
    if (start === -1) continue;
    const body = source.slice(start);
    const end = body.indexOf("};");
    const section = body.slice(0, end);
    const pair = /(?:"([^"]+)"|([A-Za-z0-9_@.$-]+))\s*:\s*\n?\s*"([^"]+)"/g;
    let match;
    while ((match = pair.exec(section))) {
      const name = (match[1] || match[2]).trim();
      const url = match[3];
      const slug = slugify(name);
      const category = block.category === "airtime" ? "airtime" : TV.has(slug) ? "tv" : /elec|electric/.test(slug) ? "electricity" : "betting";
      entries.push({ name, slug, url, category });
    }
  }
  return entries;
};

const main = async () => {
  const source = fs.readFileSync(SOURCE, "utf8");
  const entries = parseMaps(source);
  await mkdir(OUT_DIR, { recursive: true });

  const byUrl = new Map();
  const manifest = [];
  let saved = 0;

  for (const entry of entries) {
    const existing = byUrl.get(entry.url);
    if (existing) {
      manifest.push({ ...entry, file: existing, url: undefined, source: undefined });
      continue;
    }

    const file = `${OUT_DIR}/${entry.slug}.png`;
    try {
      const buffer = await fetchBuffer(entry.url);
      if (!buffer) throw new Error("not an image");
      await sharp(buffer)
        .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9, palette: true })
        .toFile(file);
      byUrl.set(entry.url, file);
      saved += 1;
      console.log(`saved ${entry.category}/${entry.slug}`);
      manifest.push({ ...entry, file, url: undefined, source: undefined });
    } catch (error) {
      console.error(`failed ${entry.slug}: ${error.message}`);
      manifest.push({ ...entry, file: null, url: undefined, source: undefined });
    }
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`\n${saved}/${entries.length} bill logos saved -> ${MANIFEST}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
