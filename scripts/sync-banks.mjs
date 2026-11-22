import { mkdir, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SOURCE_URL = "https://nigerianbanks.xyz/";
const OUT_DIR = "banks/ng";
const MANIFEST = "banks/manifest.json";
const OUR_BANKS = "data/banks-ng.json";
const MAX_SIZE = 256;

const ALIASES = {
  "9 payment": "9mobile 9payment service bank",
  "access bank nigeria": "access bank",
  "access bank plc diamond": "access bank diamond",
  "access money": "access bank",
  "access yello and beta": "access bank",
  "alat by wema": "alat by wema",
  "branch international financial services": "branch international finance company limited",
  "carbon one finance": "carbon",
  "citi bank": "citibank nigeria",
  "eyowo": "eyowo",
  "fairmoney": "fairmoney microfinance bank",
  "fcmb mfb": "fcmb mfb",
  "first bank of nigeria": "first bank of nigeria",
  "first city monument bank": "first city monument bank",
  "first trust mortgage bank plc": "firsttrust mortgage bank nigeria",
  "gtbank": "guaranty trust bank",
  "gtbank mobile money": "guaranty trust bank",
  "guaranty trust bank": "guaranty trust bank",
  "imperial homes mortgage bank": "imperial homes mortage bank",
  "kebbi state home savings and loans limited": "kebbi homes savings and loans limited",
  "kuda micro finance": "kuda bank",
  "michael okpara uniagric micro": "michael okpara uniagric microfinance bank",
  "moniepoint microfinance": "moniepoint mfb ng",
  "momo psb": "mtn momo psb",
  "opay": "opay digital services limited",
  "palmpay": "palmpay",
  "pocket app": "pocket app",
  "sparkle": "sparkle microfinance bank",
  "sterling bank": "sterling bank",
  "titan trust bank": "titan bank",
  "uba": "united bank for africa",
  "u and c mfb": "u and c mfb",
  "united bank for africa": "united bank for africa",
  "vfd micro finance": "vfd",
  "wema bank": "wema bank",
  "zenith bank": "zenith bank",
};

// Different entities whose normalised tokens collide (e.g. Titan-Paystack MFB vs Paystack-Titan).
const NO_FUZZY = new Set(["titan paystack microfinance", "paystack titan"]);

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "simfy-brand-assets" } });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
};

const download = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "simfy-brand-assets" } });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) return null;
  return Buffer.from(await response.arrayBuffer());
};

const optimize = async (buffer, target) => {
  await sharp(buffer)
    .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(target);
};

const main = async () => {
  const ours = JSON.parse(fs.readFileSync(OUR_BANKS, "utf8"));
  const source = await fetchJson(SOURCE_URL);
  const { normalizeName, tokenOverlap, filenameCode } = await import("./lib/names.mjs");

  const candidates = source
    .filter((entry) => entry.logo && !entry.logo.includes("default-image"))
    .map((entry) => ({ ...entry, normalized: normalizeName(entry.name) }));

  const byNormalized = new Map();
  for (const entry of candidates) {
    if (!byNormalized.has(entry.normalized) && !NO_FUZZY.has(entry.normalized)) {
      byNormalized.set(entry.normalized, entry);
    }
  }

  const aliases = new Map(
    Object.entries(ALIASES).map(([key, value]) => [normalizeName(key), normalizeName(value)])
  );

  await mkdir(OUT_DIR, { recursive: true });

  const manifest = [];
  let downloaded = 0;

  for (const bank of ours) {
    const normalized = normalizeName(bank.name);
    const alias = aliases.get(normalized) || null;

    let match = alias ? byNormalized.get(alias) : null;
    if (!match) match = byNormalized.get(normalized);
    if (!match && !NO_FUZZY.has(normalized)) {
      const scored = candidates
        .filter((entry) => !NO_FUZZY.has(entry.normalized))
        .map((entry) => ({ entry, score: tokenOverlap(normalized, entry.normalized) }))
        .sort((a, b) => b.score - a.score);
      if (scored[0] && scored[0].score >= 0.8) match = scored[0].entry;
    }

    if (match && normalizeName(match.name) !== normalized) {
      console.log(`fuzzy ${bank.code} ${bank.name} <- ${match.name}`);
    }

    const file = match ? `${OUT_DIR}/${filenameCode(bank.code)}.png` : null;
    let saved = false;

    if (match && file) {
      try {
        const buffer = await download(match.logo);
        if (buffer) {
          await optimize(buffer, file);
          saved = true;
          downloaded += 1;
          console.log(`saved ${bank.code} ${bank.name} <- ${match.name}`);
        }
      } catch (error) {
        console.error(`failed ${bank.code} ${bank.name}: ${error.message}`);
      }
    }

    manifest.push({
      code: bank.code,
      name: bank.name,
      file: saved ? path.relative(".", file) : null,
      source: saved ? match.name : null,
    });
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`\n${downloaded}/${ours.length} bank logos saved -> ${MANIFEST}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
