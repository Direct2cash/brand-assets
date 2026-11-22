import { mkdir, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import { slugify } from "./lib/names.mjs";

const OUT_DIR = "giftcards";
const MANIFEST = "giftcards/manifest.json";
const LOGO_MAP = "giftcards/logo-map.json";
const MAX_SIZE = 256;
const CONCURRENCY = 8;

const { RELOADLY_URL, RELOADLY_CLIENT_ID, RELOADLY_CLIENT_SECRET } = process.env;

const auth = async () => {
  if (!RELOADLY_URL || !RELOADLY_CLIENT_ID || !RELOADLY_CLIENT_SECRET) {
    throw new Error("RELOADLY_URL, RELOADLY_CLIENT_ID and RELOADLY_CLIENT_SECRET are required");
  }
  const response = await fetch("https://auth.reloadly.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: RELOADLY_CLIENT_ID,
      client_secret: RELOADLY_CLIENT_SECRET,
      grant_type: "client_credentials",
      audience: RELOADLY_URL,
    }),
  });
  if (!response.ok) throw new Error(`auth ${response.status}`);
  const data = await response.json();
  return data.access_token;
};

const api = async (token, path) => {
  const response = await fetch(`${RELOADLY_URL}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/com.reloadly.giftcards-v1+json",
    },
  });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response.json();
};

const fileFor = (brand, url) =>
  `${OUT_DIR}/${slugify(brand) || "giftcard"}-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 6)}.png`;

const main = async () => {
  const token = await auth();
  const countries = await api(token, "/countries");
  const products = new Map();

  for (const country of countries) {
    let page = 0;
    for (;;) {
      const data = await api(token, `/products?countryCode=${country.isoName}&size=500&page=${page}`);
      for (const product of data.content || []) {
        if (product.status !== "ACTIVE" || !product.logoUrls?.length) continue;
        products.set(String(product.productId), product);
      }
      if (data.last || !data.content?.length) break;
      page += 1;
    }
    console.log(`${country.isoName}: ${products.size} unique products`);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const logoMap = {};
  const files = new Map();

  for (const product of products.values()) {
    const url = product.logoUrls[0];
    if (logoMap[url]) continue;
    const file = fileFor(product.brand.brandName, url);
    logoMap[url] = file;
    files.set(url, file);
  }

  const unique = [...files.entries()];
  let saved = 0;

  for (let index = 0; index < unique.length; index += CONCURRENCY) {
    const chunk = unique.slice(index, index + CONCURRENCY);
    await Promise.all(
      chunk.map(async ([url, file]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`logo ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          await sharp(buffer)
            .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
            .png({ compressionLevel: 9, palette: true })
            .toFile(file);
          saved += 1;
          console.log(`saved ${file}`);
        } catch (error) {
          console.error(`failed ${file}: ${error.message}`);
          delete logoMap[url];
        }
      })
    );
  }

  const manifest = [...products.values()].map((product) => ({
    productId: String(product.productId),
    name: product.productName,
    brand: product.brand.brandName,
    brandId: product.brand.brandId,
    country: product.country.isoName,
    logoUrl: product.logoUrls[0],
    file: logoMap[product.logoUrls[0]] || null,
  }));

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  await writeFile(LOGO_MAP, `${JSON.stringify(logoMap, null, 1)}\n`);
  console.log(`\n${saved}/${unique.length} giftcard logos saved, ${manifest.length} products -> ${MANIFEST}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
