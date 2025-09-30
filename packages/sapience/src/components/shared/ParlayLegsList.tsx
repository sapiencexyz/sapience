'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import * as React from 'react';

export interface ParlayLeg {
  shortName?: string | null;
  question?: string | null;
  conditionId?: string | null;
  choice: 'Yes' | 'No';
}

export default function ParlayLegsList({
  legs,
  className,
  layout = 'column',
  maxWidthClass,
}: {
  legs: ParlayLeg[];
  className?: string;
  layout?: 'row' | 'column';
  // Optional max width utility classes, e.g. "max-w-[320px]"
  maxWidthClass?: string;
}) {
  if (!legs || legs.length === 0) {
    return null;
  }

  const isRow = layout === 'row';
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [showRightFade, setShowRightFade] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!isRow) return;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      try {
        const maxScroll = el.scrollWidth - el.clientWidth;
        setShowRightFade(el.scrollLeft < maxScroll - 1);
      } catch {
        setShowRightFade(false);
      }
    };
    update();
    const onScroll = () => update();
    const onResize = () => update();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true } as any);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [isRow]);

  return (
    <div
      className={className ? className : undefined}
      style={isRow ? { position: 'relative' } : undefined}
    >
      {isRow ? (
        <div
          ref={scrollRef}
          className={`${maxWidthClass ?? 'max-w-[320px]'} overflow-x-auto`}
        >
          <div className="flex items-center gap-4 md:gap-5 whitespace-nowrap pr-6">
            {legs.map((leg, idx) => {
              const text =
                leg.shortName || leg.question || leg.conditionId || '';
              const isHexId = /^0x[0-9a-fA-F]{64}$/.test(String(text));
              return (
                <div
                  key={idx}
                  className="text-sm inline-flex items-center gap-2 shrink-0"
                >
                  {isHexId ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="font-medium underline decoration-dotted underline-offset-4 hover:opacity-80"
                          aria-label="View missing condition details"
                        >
                          Parlay Condition Not Found
                        </button>
                      </PopoverTrigger>
                      <PopoverContent>
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            Condition ID
                          </div>
                          <div className="text-xs break-all font-mono text-muted-foreground">
                            {String(text)}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <span
                      className="font-medium truncate max-w-[520px]"
                      title={String(text)}
                    >
                      {text}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={
                      leg.choice === 'Yes'
                        ? 'px-1.5 py-0.5 text-xs font-medium border-green-500/40 bg-green-500/10 text-green-600 shrink-0'
                        : 'px-1.5 py-0.5 text-xs font-medium border-red-500/40 bg-red-500/10 text-red-600 shrink-0'
                    }
                  >
                    {leg.choice}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {legs.map((leg, idx) => {
            const text = leg.shortName || leg.question || leg.conditionId || '';
            const isHexId = /^0x[0-9a-fA-F]{64}$/.test(String(text));
            return (
              <div
                key={idx}
                className="text-sm inline-flex items-center gap-2 shrink-0"
              >
                {isHexId ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="font-medium underline decoration-dotted underline-offset-4 hover:opacity-80"
                        aria-label="View missing condition details"
                      >
                        Parlay Condition Not Found
                      </button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <div className="space-y-1">
                        <div className="text-sm font-medium">Condition ID</div>
                        <div className="text-xs break-all font-mono text-muted-foreground">
                          {String(text)}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span
                    className="font-medium truncate max-w-[520px]"
                    title={String(text)}
                  >
                    {text}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className={
                    leg.choice === 'Yes'
                      ? 'px-1.5 py-0.5 text-xs font-medium border-green-500/40 bg-green-500/10 text-green-600 shrink-0'
                      : 'px-1.5 py-0.5 text-xs font-medium border-red-500/40 bg-red-500/10 text-red-600 shrink-0'
                  }
                >
                  {leg.choice}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
      {isRow && showRightFade ? (
        <div className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-card to-transparent" />
      ) : null}
    </div>
  );
}
