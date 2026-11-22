import { mkdir, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { slugify, normalizeName } from "./lib/names.mjs";

const SOURCES = "data/manual-brand-sources.json";
const OUT_DIR = "giftcards/manual";
const MANIFEST = "giftcards/manual/manifest.json";
const BRAND_MAP = "giftcards/manual/brand-map.json";
const MAX_SIZE = 256;
const FORCE = process.argv.includes("--force");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "simfy-brand-assets/1.0 (ops@getsimfy.com)";

const api = async (params) => {
  const url = `${API}?${new URLSearchParams(params)}`;
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
};

const resolveFiles = async (titles) => {
  const resolved = new Map();
  for (let index = 0; index < titles.length; index += 40) {
    const batch = titles.slice(index, index + 40);
    const data = await api({
      action: "query",
      format: "json",
      titles: batch.map((title) => `File:${title}`).join("|"),
      prop: "imageinfo",
      iiprop: "url|mime",
    });
    for (const page of Object.values(data.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      if (info?.url) resolved.set(page.title.replace(/^File:/, ""), info);
    }
  }
  return resolved;
};

const main = async () => {
  const sources = JSON.parse(fs.readFileSync(SOURCES, "utf8"));
  const titles = [...new Set(Object.values(sources).map((entry) => entry.file))];
  const resolved = await resolveFiles(titles);
  await mkdir(OUT_DIR, { recursive: true });

  const manifest = [];
  const brandMap = {};
  let saved = 0;

  for (const [brand, entry] of Object.entries(sources)) {
    const info = resolved.get(entry.file);
    if (!info) {
      console.error(`unresolved ${brand} -> ${entry.file}`);
      manifest.push({ brand, file: null });
      continue;
    }

    const file = `${OUT_DIR}/${slugify(brand)}.png`;
    if (!FORCE && fs.existsSync(file)) {
      brandMap[normalizeName(brand)] = file;
      manifest.push({ brand, file, sourceFile: entry.file, sourceUrl: null });
      saved += 1;
      continue;
    }
    try {
      let buffer = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(info.url, { headers: { "user-agent": USER_AGENT } });
        if (response.ok) {
          buffer = Buffer.from(await response.arrayBuffer());
          break;
        }
        if (response.status !== 429) throw new Error(`download ${response.status}`);
        console.log(`rate limited ${brand}, waiting`);
        await sleep(15000 * (attempt + 1));
      }
      if (!buffer) throw new Error("download rate limited");
      await sleep(250);
      await sharp(buffer)
        .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toFile(file);
      brandMap[normalizeName(brand)] = file;
      manifest.push({ brand, file, sourceFile: entry.file, sourceUrl: info.url });
      saved += 1;
      console.log(`saved ${brand} <- ${entry.file}`);
    } catch (error) {
      console.error(`failed ${brand}: ${error.message}`);
      manifest.push({ brand, file: null });
    }
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  await writeFile(BRAND_MAP, `${JSON.stringify(brandMap, null, 1)}\n`);
  console.log(`\n${saved}/${Object.keys(sources).length} manual brand logos saved -> ${MANIFEST}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
