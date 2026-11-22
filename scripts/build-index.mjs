import { writeFile } from "node:fs/promises";
import fs from "node:fs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const banks = read("banks/manifest.json");
const bills = read("bills/manifest.json");
const coins = read("coins/manifest.json");
const giftcards = read("giftcards/manifest.json");
const giftcardLogoMap = read("giftcards/logo-map.json");
const sochitelCards = read("giftcards/sochitel/manifest.json");
const sochitelLogoMap = read("giftcards/sochitel/logo-map.json");

const index = {
  version: 1,
  generatedAt: new Date().toISOString(),
  namespaces: {
    banks: "banks/ng",
    bills: "bills",
    coins: "coins",
    giftcards: "giftcards",
  },
  banks: Object.fromEntries(
    banks
      .filter((bank) => bank.file)
      .map((bank) => [bank.code, { name: bank.name, path: bank.file }])
  ),
  bills: Object.fromEntries(
    bills
      .filter((bill) => bill.file)
      .map((bill) => [bill.slug, { name: bill.name, category: bill.category, path: bill.file }])
  ),
  coins: Object.fromEntries(
    coins
      .filter((coin) => coin.file)
      .map((coin) => [coin.symbol.toLowerCase(), { name: coin.name, path: coin.file }])
  ),
  giftcards: Object.fromEntries(
    giftcards
      .filter((card) => card.file)
      .map((card) => [
        card.productId,
        { name: card.name, brand: card.brand, country: card.country, path: card.file },
      ])
  ),
  giftcardLogoMap,
  sochitelGiftcards: Object.fromEntries(
    sochitelCards
      .filter((card) => card.file)
      .map((card) => [
        card.operatorId,
        { name: card.name, brand: card.brand, country: card.country, path: card.file },
      ])
  ),
  sochitelLogoMap,
};

await writeFile("index.json", `${JSON.stringify(index, null, 1)}\n`);
console.log(
  `index.json: ${Object.keys(index.banks).length} banks, ${Object.keys(index.bills).length} bills, ${Object.keys(index.coins).length} coins, ${Object.keys(index.giftcards).length} reloadly giftcards, ${Object.keys(index.sochitelGiftcards).length} sochitel operators`
);
