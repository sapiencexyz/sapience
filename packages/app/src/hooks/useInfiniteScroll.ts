'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface UseInfiniteScrollOptions {
  hasMore?: boolean;
  isFetchingMore?: boolean;
  isLoading?: boolean;
  onFetchMore?: () => void;
  /** Scroll container ref — attaches a scroll listener so the sentinel is
   *  detected relative to the scrollable area, not just the viewport. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

/**
 * Returns a sentinel ref to attach to a div at the bottom of a scrollable list.
 * When the sentinel becomes visible, `onFetchMore` is called automatically.
 *
 * Detection strategy (all three run in parallel):
 * 1. Scroll listener on the container — handles internal container scroll.
 * 2. Scroll listener on window — handles page-level scroll (table view uses
 *    minHeight + overflow-visible, so the page scrolls instead of the container).
 * 3. Post-load re-check — after every fetch completes, re-checks sentinel
 *    visibility so back-to-back pages load automatically on tall viewports.
 *
 * Uses refs for callback values to avoid recreating listeners when props change.
 */
export function useInfiniteScroll({
  hasMore,
  isFetchingMore,
  isLoading,
  onFetchMore,
  scrollContainerRef,
}: UseInfiniteScrollOptions) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const hasMoreRef = useRef(hasMore);
  const isFetchingMoreRef = useRef(isFetchingMore);
  const onFetchMoreRef = useRef(onFetchMore);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    isFetchingMoreRef.current = isFetchingMore;
  }, [isFetchingMore]);
  useEffect(() => {
    onFetchMoreRef.current = onFetchMore;
  }, [onFetchMore]);

  /** Check if the sentinel is near the visible area. Uses the viewport since
   *  the sentinel's getBoundingClientRect is always relative to the viewport
   *  regardless of which ancestor is scrolling. */
  const checkSentinel = useRef(() => {
    if (!hasMoreRef.current || isFetchingMoreRef.current) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const rect = sentinel.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight + 200 && rect.bottom > -200;
    if (isVisible) onFetchMoreRef.current?.();
  });

  // Scroll listener on the container — fires when the container itself scrolls.
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        checkSentinel.current();
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollContainerRef]);

  // Scroll listener on window — fires when the page scrolls (covers the table
  // view where the scroll container grows with content and doesn't scroll).
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        checkSentinel.current();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Post-load visibility re-check — fires after initial load AND after each
  // fetchMore completes so the next page is triggered when the sentinel is
  // already visible (e.g. on tall viewports or when few rows are returned).
  const prevFetchingRef = useRef(isLoading || isFetchingMore);
  useEffect(() => {
    const wasFetching = prevFetchingRef.current;
    const nowFetching = isLoading || isFetchingMore;
    prevFetchingRef.current = nowFetching;

    if (wasFetching && !nowFetching && hasMoreRef.current) {
      checkSentinel.current();
    }
  }, [isLoading, isFetchingMore]);

  return { loadMoreRef };
}
