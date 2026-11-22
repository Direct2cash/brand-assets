# Simfy / Rivo brand assets

Static brand art served over jsDelivr. One home for bank logos, biller logos and coin icons used by `backend-api`, `simfy-webv2` and `mobile_app`.

## Served URLs

Pinned to a release tag (immutable cache):

```
https://cdn.jsdelivr.net/gh/Direct2cash/brand-assets@v1/<path>
```

Branch URL for pre-release testing (`@main` is cached ~12h):

```
https://cdn.jsdelivr.net/gh/Direct2cash/brand-assets@main/<path>
```

Fallbacks if jsDelivr is unreachable:

```
https://raw.githubusercontent.com/Direct2cash/brand-assets/main/<path>
https://direct2cash.github.io/brand-assets/<path>   (only if Pages is enabled)
```

## Layout

```
index.json              # single lookup: code/slug/symbol -> { name, path }
banks/ng/<code>.png     # filename = bank code from bank_lists (NIP code, lowercased)
banks/manifest.json     # [{ code, name, file, source }] — includes banks without a logo
bills/<slug>.png        # airtime, tv, betting, electricity
bills/manifest.json     # [{ name, slug, category, file }]
coins/<symbol>.png      # lowercase symbol, e.g. btc.png
coins/manifest.json     # [{ symbol, name, file }]
giftcards/<brand>-<hash>.png   # deduped by Reloadly logo URL
giftcards/manifest.json        # [{ productId, name, brand, country, logoUrl, file }]
giftcards/logo-map.json        # { reloadlyLogoUrl: path } — runtime lookup key
scripts/*.mjs           # sync + index + validation
```

`file: null` in a manifest means the source had no usable artwork. Clients must fall back (initials avatar or generic icon).

## Backend usage

Set one env var and build URLs from it:

```
ASSETS_BASE_URL=https://cdn.jsdelivr.net/gh/Direct2cash/brand-assets@v1
```

```ts
// bank logo, null when the bank has no artwork
const logo = manifest.banks[bank.code]
  ? `${process.env.ASSETS_BASE_URL}/${manifest.banks[bank.code].path}`
  : null;
```

Giftcard logos are resolved by the Reloadly URL the API already returns, so no
product-id mapping is needed:

```ts
const logo = logoMap[product.logoUrls[0]];
product.logo = logo ? `${process.env.ASSETS_BASE_URL}/${logo}` : product.logoUrls[0];
```

Bank codes are NIP codes (`000014` Access, `000013` GTBank) — not CBN codes — so they match the production `bank_lists` collection.

## Adding or updating assets

1. Add/replace the file in the right folder. PNG, max 512px, max 150KB.
2. Update the matching manifest (`file: "<folder>/<name>.png"`).
3. `npm install`
4. `npm run index`
5. `npm run validate`
6. Commit, tag a release (`git tag v1` / `v1.1`), push tag.

`npm run validate` fails on missing files, orphans, oversize files and duplicate keys. A ready-to-use GitHub Actions workflow lives in `ci/validate.yml`; move it to `.github/workflows/` once the push token has the `workflow` scope.

## Content sources

- Bank logos: [nigerianbanks.xyz](https://nigerianbanks.xyz) community dataset, matched to our bank codes by normalised name. Only banks with real artwork are included (202 of 584).
- Bills: migrated from the existing Simfy Cloudinary account (`dnzzxtemp`).
- Coins: [cryptocurrency-icons](https://github.com/spothq/cryptocurrency-icons) (MIT), CoinGecko for Conflux (CFX), Cloudinary fallback for fiat symbols.
- Giftcards: pulled from the Reloadly catalog (`/products`, all 169 countries). 1,699 active products map to 226 unique logo files.

Bank, biller and coin marks are trademarks of their owners, included here solely to identify the corresponding institution or product in the app. No affiliation or endorsement is implied.

Do not commit secrets, customer data or dynamic uploads (KYC docs, business logos, banners). Those stay in Cloudinary.
