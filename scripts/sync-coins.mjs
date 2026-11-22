import { mkdir, writeFile } from "node:fs/promises";
import fs from "node:fs";
import sharp from "sharp";

const SOURCE = process.argv[2] || "../backend-api/src/core/seed/coins.ts";
const OUT_DIR = "coins";
const MANIFEST = "coins/manifest.json";
const MAX_SIZE = 256;
const CRYPTO_ICONS = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color";

const fetchBuffer = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "simfy-brand-assets" } });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
};

const parseCoins = (source) => {
  const start = source.indexOf("const defaultCoins");
  const body = source.slice(start);
  const blocks = body.split(/\n  \{\n/).slice(1);
  const coins = [];
  for (const block of blocks) {
    const symbol = block.match(/symbol:\s*"([^"]+)"/)?.[1];
    const name = block.match(/name:\s*"([^"]+)"/)?.[1];
    const icon = block.match(/icon:\s*"([^"]+)"/)?.[1];
    if (symbol && icon) coins.push({ symbol, name, icon });
  }
  return coins;
};

const main = async () => {
  const source = fs.readFileSync(SOURCE, "utf8");
  const coins = parseCoins(source);
  await mkdir(OUT_DIR, { recursive: true });

  const manifest = [];
  let saved = 0;

  for (const coin of coins) {
    const symbol = coin.symbol.toLowerCase();
    const file = `${OUT_DIR}/${symbol}.png`;
    const candidates = [`${CRYPTO_ICONS}/${symbol}.png`, coin.icon];

    let done = false;
    for (const url of candidates) {
      try {
        const buffer = await fetchBuffer(url);
        if (!buffer) continue;
        await sharp(buffer)
          .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
          .png({ compressionLevel: 9, palette: true })
          .toFile(file);
        done = true;
        saved += 1;
        console.log(`saved ${symbol} <- ${url}`);
        break;
      } catch (error) {
        console.error(`candidate failed ${symbol}: ${error.message}`);
      }
    }

    manifest.push({ symbol: coin.symbol, name: coin.name, file: done ? file : null });
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`\n${saved}/${coins.length} coin logos saved -> ${MANIFEST}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
