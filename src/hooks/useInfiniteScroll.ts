'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';

interface UseInfiniteScrollOptions {
  hasMore?: boolean;
  isFetchingMore?: boolean;
  isLoading?: boolean;
  onFetchMore?: () => void;
  /**
   * Optional scrollport the list lives inside. Used as the observer root only
   * while it actually scrolls; otherwise the viewport is the frame of
   * reference.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

/** Start fetching this far before the sentinel reaches the fold. */
const PREFETCH_MARGIN_PX = 400;

/**
 * Returns a sentinel ref to attach to a div at the bottom of a list. When the
 * sentinel comes into view, `onFetchMore` fires.
 *
 * Two details matter here, and both have caused this to silently stop paging:
 *
 * 1. It observes rather than listening for scroll. A scroll listener only fires
 *    on the element that actually scrolls, so whenever the scrollport moved
 *    between an ancestor and the window, paging died. Intersection is reported
 *    no matter who scrolls.
 * 2. The observer is attached from a *callback ref*, not an effect. The sentinel
 *    renders below a loading branch, so on the first commit the node may not
 *    exist yet — an effect keyed on anything but the node would run once
 *    against `null` and never retry.
 */
export function useInfiniteScroll({
  hasMore,
  isFetchingMore,
  isLoading,
  onFetchMore,
  scrollContainerRef,
}: UseInfiniteScrollOptions) {
  // Read through refs so a fetch starting or finishing doesn't tear down and
  // rebuild the observer.
  const hasMoreRef = useRef(hasMore);
  const isFetchingMoreRef = useRef(isFetchingMore);
  const isLoadingRef = useRef(isLoading);
  const onFetchMoreRef = useRef(onFetchMore);
  hasMoreRef.current = hasMore;
  isFetchingMoreRef.current = isFetchingMore;
  isLoadingRef.current = isLoading;
  onFetchMoreRef.current = onFetchMore;

  /** Whether the sentinel is on screen, so a finished page can pull the next. */
  const isVisibleRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const maybeFetch = useRef(() => {
    if (!isVisibleRef.current) return;
    if (!hasMoreRef.current) return;
    if (isFetchingMoreRef.current || isLoadingRef.current) return;
    onFetchMoreRef.current?.();
  });

  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      isVisibleRef.current = false;

      if (!node || typeof IntersectionObserver === 'undefined') return;

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
      observer.observe(node);
      observerRef.current = observer;
    },
    [scrollContainerRef]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  // A page that lands while the sentinel is still on screen should pull the
  // next one — intersection never changed, so the observer won't re-fire.
  useEffect(() => {
    if (isLoading || isFetchingMore) return;
    maybeFetch.current();
  }, [isLoading, isFetchingMore, hasMore]);

  return { loadMoreRef };
}
