'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface UseInfiniteScrollOptions {
  hasMore?: boolean;
  isFetchingMore?: boolean;
  isLoading?: boolean;
  onFetchMore?: () => void;
  /**
   * Optional scrollport the list lives inside. Passing it scopes the observer
   * to that element; omit it (or pass a ref to a non-scrolling element) and the
   * viewport is used.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

/** Start fetching this far before the sentinel actually reaches the fold. */
const PREFETCH_MARGIN_PX = 400;

/**
 * Returns a sentinel ref to attach to a div at the bottom of a list. When the
 * sentinel comes into view, `onFetchMore` fires.
 *
 * Uses IntersectionObserver rather than scroll listeners plus
 * `getBoundingClientRect` math. Scroll listeners only fire on the element that
 * actually scrolls, so they break whenever the scrollport moves — a wrapper
 * gaining or losing a definite height silently stops paging. The observer
 * reports intersection regardless of which ancestor scrolls, and fires once on
 * observe, so a sentinel that is already visible (short first page, tall
 * viewport) pages immediately instead of waiting for a scroll that never comes.
 */
export function useInfiniteScroll({
  hasMore,
  isFetchingMore,
  isLoading,
  onFetchMore,
  scrollContainerRef,
}: UseInfiniteScrollOptions) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Read through refs so the observer isn't torn down and rebuilt on every
  // fetch — rebuilding mid-fetch drops the "already visible" callback.
  const hasMoreRef = useRef(hasMore);
  const isFetchingMoreRef = useRef(isFetchingMore);
  const isLoadingRef = useRef(isLoading);
  const onFetchMoreRef = useRef(onFetchMore);
  hasMoreRef.current = hasMore;
  isFetchingMoreRef.current = isFetchingMore;
  isLoadingRef.current = isLoading;
  onFetchMoreRef.current = onFetchMore;

  // Whether the sentinel is on screen right now, so a finished fetch can page
  // again without needing another scroll event.
  const isVisibleRef = useRef(false);

  const maybeFetch = useRef(() => {
    if (!isVisibleRef.current) return;
    if (!hasMoreRef.current) return;
    if (isFetchingMoreRef.current || isLoadingRef.current) return;
    onFetchMoreRef.current?.();
  });

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    // Only treat the container as the observer root when it genuinely scrolls;
    // otherwise the viewport is the right frame of reference.
    const container = scrollContainerRef?.current ?? null;
    const root =
      container && container.scrollHeight > container.clientHeight
        ? container
        : null;

    const observer = new IntersectionObserver(
      (entries) => {
        isVisibleRef.current = entries.some((e) => e.isIntersecting);
        maybeFetch.current();
      },
      { root, rootMargin: `0px 0px ${PREFETCH_MARGIN_PX}px 0px` }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  // A page that finishes while the sentinel is still on screen should pull the
  // next one — the observer won't re-fire, since intersection never changed.
  useEffect(() => {
    if (isLoading || isFetchingMore) return;
    maybeFetch.current();
  }, [isLoading, isFetchingMore, hasMore]);

  return { loadMoreRef };
}
