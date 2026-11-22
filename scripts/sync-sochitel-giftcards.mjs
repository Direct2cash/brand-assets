import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeName, slugify, tokenOverlap } from "./lib/names.mjs";

const API_URL = process.env.SOCHITEL_URL;
const USERNAME = process.env.SOCHITEL_USERNAME;
const PASSWORD = process.env.SOCHITEL_PASSWORD;
const CONCURRENCY = 20;
const OUT_DIR = "giftcards/sochitel";
const CACHE_DIR = ".cache/sochitel";
const MANIFEST = "giftcards/sochitel/manifest.json";
const LOGO_MAP = "giftcards/sochitel/logo-map.json";
const RELOADLY_MANIFEST = "giftcards/manifest.json";
const MANUAL_BRAND_MAP = "giftcards/manual/brand-map.json";

// Sochitel brand names that differ from the Reloadly catalogue.
const BRAND_ALIASES = {
  "apple itunes": "itunes",
  "apple store": "apple",
  "google play": "google play",
  "nintendo eshop": "nintendo",
  "playstation network": "playstation",
  "xbox live": "xbox",
  "razer gold": "razer",
  "free fire": "garena free fire",
  "mobile legends": "mobile legends bang bang",
  "vanilla visa": "vanilla",
  "visa prepaid": "visa",
  "amazon com": "amazon",
  "amazon us": "amazon",
  addidas: "adidas",
  freefire: "free fire",
  "pubg mobile uc": "pubg",
  "uber eats": "uber eats",
};

const sha1 = (value) => crypto.createHash("sha1").update(value).digest("hex");

const fetchJson = async (url, options) => {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
};

const call = async (country, category) => {
  const salt = crypto.randomBytes(12).toString("hex");
  const body = {
    auth: { username: USERNAME, salt, password: sha1(salt + sha1(PASSWORD)) },
    version: "5",
    country,
    productCategory: category,
    command: "getOperators",
  };
  const data = await fetchJson(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return Object.values(data.result || {}).filter((operator) => operator?.id);
};

const cachedCall = async (country, category) => {
  const file = path.join(CACHE_DIR, `${country}-${category}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(await readFile(file, "utf8"));
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const operators = await call(country, category);
      await writeFile(file, JSON.stringify(operators));
      return operators;
    } catch (error) {
      if (attempt === 2) {
        console.error(`fail ${country}/${category}: ${error.message}`);
        await writeFile(file, JSON.stringify([]));
        return [];
      }
    }
  }
  return [];
};

const crawl = async (countries, categories) => {
  const tasks = countries.flatMap((country) =>
    categories.map((category) => ({ country, category }))
  );
  await mkdir(CACHE_DIR, { recursive: true });

  let index = 0;
  let done = 0;
  const operators = new Map();

  const worker = async () => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= tasks.length) return;
      const { country, category } = tasks[current];
      const items = await cachedCall(country.code, category);
      for (const operator of items) {
        const key = String(operator.id);
        const existing = operators.get(key);
        operators.set(key, {
          id: key,
          name: operator.name,
          brandName: operator.brandName,
          brandId: String(operator.brandId ?? ""),
          country: country.code,
          countryName: country.name,
          categories: [
            ...new Set([...(existing?.categories || []), ...(operator.productCategories || [])]),
          ],
        });
      }
      done += 1;
      if (done % 100 === 0) console.log(`${done}/${tasks.length} requests`);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return [...operators.values()];
};

const buildBrandIndex = (reloadly) => {
  const index = new Map();
  for (const product of reloadly) {
    if (!product.file) continue;
    const key = normalizeName(product.brand);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(product);
  }
  return index;
};

const matchBrand = (operator, brandIndex, reloadly) => {
  const raw = (operator.brandName || operator.name || "").replace(
    new RegExp(`^${operator.countryName}\\s+`, "i"),
    ""
  );
  let key = normalizeName(raw);
  const alias = BRAND_ALIASES[key];
  if (alias) key = normalizeName(alias);

  let candidates = brandIndex.get(key);
  if (!candidates) {
    const scored = reloadly
      .filter((product) => product.file)
      .map((product) => ({
        product,
        score: tokenOverlap(key, normalizeName(product.brand)),
      }))
      .sort((a, b) => b.score - a.score);
    if (scored[0] && scored[0].score >= 0.75) candidates = [scored[0].product];
  }
  if (!candidates?.length) return null;

  return (
    candidates.find((product) => product.country === operator.country) ||
    candidates[0]
  );
};

const main = async () => {
  if (!API_URL || !USERNAME || !PASSWORD) {
    throw new Error("SOCHITEL_URL, SOCHITEL_USERNAME and SOCHITEL_PASSWORD are required");
  }
  const countries = JSON.parse(fs.readFileSync("data/sochitel-countries.json", "utf8"));
  const categories = JSON.parse(fs.readFileSync("data/sochitel-categories.json", "utf8"));
  const reloadly = fs.existsSync(RELOADLY_MANIFEST)
    ? JSON.parse(fs.readFileSync(RELOADLY_MANIFEST, "utf8"))
    : [];
  const manualBrands = fs.existsSync(MANUAL_BRAND_MAP)
    ? JSON.parse(fs.readFileSync(MANUAL_BRAND_MAP, "utf8"))
    : {};

  console.log(`crawling ${countries.length} countries x ${categories.length} categories`);
  const operators = await crawl(countries, categories);
  console.log(`unique operators: ${operators.length}`);

  const brandIndex = buildBrandIndex(reloadly);
  await mkdir(OUT_DIR, { recursive: true });

  const manifest = [];
  const logoMap = {};
  let matched = 0;

  for (const operator of operators.sort((a, b) => Number(a.id) - Number(b.id))) {
    const product = matchBrand(operator, brandIndex, reloadly);
    const rawBrand = (operator.brandName || operator.name || "").replace(
      new RegExp(`^${operator.countryName}\\s+`, "i"),
      ""
    );
    const manualFile = manualBrands[normalizeName(rawBrand)];
    let file = null;
    let sourceBrand = null;

    if (product || manualFile) {
      const target = `${OUT_DIR}/${operator.id}-${slugify(rawBrand)}.png`;
      await copyFile(product ? product.file : manualFile, target);
      file = target;
      logoMap[operator.id] = target;
      sourceBrand = product ? product.brand : rawBrand;
      matched += 1;
    }

    manifest.push({
      operatorId: operator.id,
      name: operator.name,
      brand: operator.brandName,
      country: operator.country,
      categories: operator.categories,
      file,
      sourceBrand,
    });
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  await writeFile(LOGO_MAP, `${JSON.stringify(logoMap, null, 1)}\n`);
  console.log(`\nmatched ${matched}/${operators.length} operators -> ${MANIFEST}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
