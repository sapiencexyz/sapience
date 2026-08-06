import { categoryMatchesFilter, isPriceSubCategory } from './categoryMatcher';

describe('isPriceSubCategory', () => {
  it('matches persisted prices sub-category slugs', () => {
    expect(isPriceSubCategory('prices-crypto')).toBe(true);
    expect(isPriceSubCategory('prices-equity')).toBe(true);
    expect(isPriceSubCategory('prices-commodities')).toBe(true);
  });

  it('does not match the abstract prices slug or unrelated categories', () => {
    expect(isPriceSubCategory('prices')).toBe(false);
    expect(isPriceSubCategory('crypto')).toBe(false);
    expect(isPriceSubCategory(undefined)).toBe(false);
  });
});

describe('categoryMatchesFilter', () => {
  it('matches exact category filters', () => {
    expect(categoryMatchesFilter('crypto', 'crypto')).toBe(true);
    expect(categoryMatchesFilter('sports', 'sports')).toBe(true);
  });

  it('treats the abstract prices filter as matching persisted prices-* slugs', () => {
    expect(categoryMatchesFilter('prices-crypto', 'prices')).toBe(true);
    expect(categoryMatchesFilter('prices-equity', 'prices')).toBe(true);
    expect(categoryMatchesFilter('prices-commodities', 'prices')).toBe(true);
  });

  it('does not cross-match unrelated filters', () => {
    expect(categoryMatchesFilter('prices-crypto', 'crypto')).toBe(false);
    expect(categoryMatchesFilter('crypto', 'prices')).toBe(false);
    expect(categoryMatchesFilter(undefined, 'prices')).toBe(false);
    expect(categoryMatchesFilter('prices-crypto', undefined)).toBe(false);
  });
});
