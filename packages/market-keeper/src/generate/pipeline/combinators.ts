/**
 * Filter combinators for composing filters with different logic
 */

import type { Filter, FilterResult } from './types';

/**
 * UnionFilter: Keep items that pass ANY of the sub-filters (OR logic)
 *
 * Each sub-filter is invoked once on the full input, and an item is kept
 * if any sub-filter's `kept` set contains it. Passing the whole list (not
 * one item at a time) is what lets sibling-aware sub-filters work — e.g. a
 * negRisk basket rescue that keeps low-volume children when at least one of
 * their event-siblings has high volume.
 */
export class UnionFilter<T> implements Filter<T> {
  name: string;
  description: string;

  constructor(private filters: Filter<T>[]) {
    this.name = filters.map((f) => f.name).join('-or-');
    this.description = `Keep items matching: ${filters.map((f) => f.name).join(' OR ')}`;
  }

  apply(items: T[]): FilterResult<T> {
    const keptSet = new Set<T>();
    for (const f of this.filters) {
      for (const item of f.apply(items).kept) {
        keptSet.add(item);
      }
    }

    const kept: T[] = [];
    const removed: T[] = [];
    for (const item of items) {
      if (keptSet.has(item)) {
        kept.push(item);
      } else {
        removed.push(item);
      }
    }

    return { kept, removed };
  }
}

/**
 * IntersectionFilter: Keep items that pass ALL of the sub-filters (AND logic)
 *
 * Use this when you want to keep items that match all conditions.
 * Each sub-filter can be tested and reused independently.
 */
export class IntersectionFilter<T> implements Filter<T> {
  name: string;
  description: string;

  constructor(private filters: Filter<T>[]) {
    this.name = filters.map((f) => f.name).join('-and-');
    this.description = `Keep items matching: ${filters.map((f) => f.name).join(' AND ')}`;
  }

  apply(items: T[]): FilterResult<T> {
    const kept: T[] = [];
    const removed: T[] = [];

    for (const item of items) {
      // Keep if ALL filters would keep this item
      const wouldKeep = this.filters.every(
        (f) => f.apply([item]).kept.length > 0
      );
      if (wouldKeep) {
        kept.push(item);
      } else {
        removed.push(item);
      }
    }

    return { kept, removed };
  }
}
