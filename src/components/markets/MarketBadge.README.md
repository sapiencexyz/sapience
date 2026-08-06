# MarketBadge maintenance

Add a new badge:

1. Drop your SVG in `packages/sapience/public/market-badges/`, e.g. `miami.svg`.
2. Map one or more keywords to the file in `packages/sapience/src/lib/marketBadges.ts`:

```ts
export const BADGE_ICON_BY_KEYWORD = {
  // ... existing entries ...
  miami: 'miami.svg',
  'south-beach': 'miami.svg',
};
```

The badge will be picked when any token in the label (including bigrams like `new-york`) matches a keyword.
If no icon matches, a circular fallback with initials is shown.
