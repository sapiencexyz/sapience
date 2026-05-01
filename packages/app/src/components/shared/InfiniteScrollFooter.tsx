import { forwardRef } from 'react';
import Loader from '~/components/shared/Loader';

/**
 * Bottom-of-table footer used by infinite-scroll tabs (Positions /
 * Forecasts / Activity). The forwarded ref is the IntersectionObserver
 * sentinel — owners pass `useInfiniteScroll().loadMoreRef` into it.
 */
type Props = {
  isLoading: boolean;
  loadingMessage: string;
  idleMessage?: string;
};

const InfiniteScrollFooter = forwardRef<HTMLDivElement, Props>(
  function InfiniteScrollFooter(
    { isLoading, loadingMessage, idleMessage = 'Scroll to load more' },
    ref
  ) {
    return (
      <div
        ref={ref}
        className="flex items-center justify-center px-4 py-6 bg-brand-black"
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Loader className="w-3 h-3" />
            <span className="text-sm text-muted-foreground font-mono uppercase">
              {loadingMessage}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground font-mono uppercase">
            {idleMessage}
          </span>
        )}
      </div>
    );
  }
);

export default InfiniteScrollFooter;
