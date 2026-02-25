'use client';

import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  hasMore?: boolean;
  isFetchingMore?: boolean;
  isLoading?: boolean;
  onFetchMore?: () => void;
}

/**
 * Returns a sentinel ref to attach to a div at the bottom of a scrollable list.
 * When the sentinel becomes visible, `onFetchMore` is called automatically.
 *
 * Uses refs for callback values to avoid recreating the IntersectionObserver
 * when props change.
 */
export function useInfiniteScroll({
  hasMore,
  isFetchingMore,
  isLoading,
  onFetchMore,
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

  // Stable IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting &&
          hasMoreRef.current &&
          !isFetchingMoreRef.current
        ) {
          onFetchMoreRef.current?.();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, []);

  // Post-load visibility re-check — uses refs to avoid effect re-firing
  // when callback identity changes (which could cause double-fetches)
  const prevIsLoadingRef = useRef(isLoading);
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    if (
      wasLoading &&
      !isLoading &&
      hasMoreRef.current &&
      !isFetchingMoreRef.current
    ) {
      const sentinel = loadMoreRef.current;
      if (sentinel) {
        const rect = sentinel.getBoundingClientRect();
        const isVisible =
          rect.top < window.innerHeight + 100 && rect.bottom > -100;
        if (isVisible) onFetchMoreRef.current?.();
      }
    }
  }, [isLoading]);

  return { loadMoreRef };
}
