const PRICE_CATEGORY_PREFIX = 'prices-';
const ABSTRACT_PRICE_CATEGORY = 'prices';

export function isPriceSubCategory(slug?: string | null): boolean {
  return !!slug && slug.startsWith(PRICE_CATEGORY_PREFIX);
}

export function categoryMatchesFilter(
  categorySlug?: string | null,
  filterSlug?: string | null
): boolean {
  if (!categorySlug || !filterSlug) return false;
  if (categorySlug === filterSlug) return true;
  if (filterSlug === ABSTRACT_PRICE_CATEGORY) {
    return isPriceSubCategory(categorySlug);
  }
  return false;
}
