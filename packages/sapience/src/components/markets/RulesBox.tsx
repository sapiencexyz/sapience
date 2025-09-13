'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RulesBoxProps {
  text?: string | null;
  collapsedMaxHeight?: number; // in px
  className?: string;
}

// Collapsible text container with gradient fade and animated expand/collapse
const RulesBox: React.FC<RulesBoxProps> = ({
  text,
  collapsedMaxHeight = 160,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [needsCollapse, setNeedsCollapse] = useState<boolean>(false);

  const resolvedText = (text || '').trim();
  const isEmpty = resolvedText.length === 0;

  const recomputeHeights = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const measured = el.scrollHeight;
    setContentHeight(measured);
    setNeedsCollapse(measured > collapsedMaxHeight + 2); // small buffer
  }, [collapsedMaxHeight]);

  useEffect(() => {
    recomputeHeights();
  }, [recomputeHeights, resolvedText]);

  // Recompute on resize using ResizeObserver where available
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const win: any = typeof window !== 'undefined' ? window : undefined;
    let ro: any = null;
    if (win?.ResizeObserver) {
      ro = new win.ResizeObserver(() => recomputeHeights());
      ro.observe(el);
      return () => {
        ro?.disconnect();
      };
    }
    const listener = () => recomputeHeights();
    win?.addEventListener?.('resize', listener);
    return () => win?.removeEventListener?.('resize', listener);
  }, [recomputeHeights]);

  const targetHeight = useMemo(() => {
    if (!needsCollapse) return 'auto';
    return isExpanded ? contentHeight : collapsedMaxHeight;
  }, [needsCollapse, isExpanded, contentHeight, collapsedMaxHeight]);

  return (
    <div className={className}>
      <div className="bg-background dark:bg-muted/50 border border-border rounded shadow-sm p-0">
        <motion.div
          ref={containerRef}
          initial={false}
          animate={{ height: targetHeight as any }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="relative overflow-hidden"
        >
          <div ref={contentRef} className="p-4">
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {isEmpty
                ? 'No additional rules clarification provided.'
                : resolvedText}
            </div>
          </div>

          {needsCollapse && !isExpanded && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16">
              <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent dark:from-muted/80" />
            </div>
          )}
        </motion.div>

        {needsCollapse && (
          <AnimatePresence initial={false}>
            {!isExpanded && (
              <motion.button
                type="button"
                onClick={() => setIsExpanded(true)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="px-4 pb-4 pt-2 w-full flex justify-center"
                aria-label="Show more rules"
              >
                <span className="text-primary underline text-xs">Show All</span>
              </motion.button>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default RulesBox;
