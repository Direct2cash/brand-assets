const NOISE = new Set([
  "plc",
  "ltd",
  "limited",
  "nigeria",
  "nigerian",
  "bank",
  "banks",
  "microfinance",
  "micro",
  "finance",
  "mfb",
  "company",
  "services",
  "service",
  "and",
  "the",
  "of",
]);

export const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

export const normalizeName = (value) => {
  const tokens = value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !NOISE.has(token));
  return tokens.join(" ");
};

export const filenameCode = (code) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

export const tokenOverlap = (a, b) => {
  const left = new Set(a.split(" ").filter(Boolean));
  const right = new Set(b.split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits / Math.max(left.size, right.size);
};
