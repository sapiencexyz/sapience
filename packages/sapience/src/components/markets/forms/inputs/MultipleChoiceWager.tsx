import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { useFormContext } from 'react-hook-form';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getSeriesColorByIndex, withAlpha } from '~/lib/theme/chartColors';
import { useWagerFlip } from '~/lib/context/WagerFlipContext';

interface MultipleChoicePredictProps {
  name?: string;
  options: Array<{ name: string; marketId: number }>;
  variant?: 'buttons' | 'dropdown';
  defaultValue?: string;
  isFlipped?: boolean;
}

export default function MultipleChoiceWagerChoiceSelect({
  name = 'predictionValue',
  options,
  variant = 'buttons',
  defaultValue,
  isFlipped,
}: MultipleChoicePredictProps) {
  const { register, setValue, watch } = useFormContext();
  const value = watch(name) ?? defaultValue;
  const { isFlipped: contextFlipped } = useWagerFlip();
  const effectiveFlipped =
    typeof isFlipped === 'boolean' ? isFlipped : contextFlipped;

  // Overflow indicators
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownOverflowing, setDropdownOverflowing] = useState(false);
  const [dropdownAtBottom, setDropdownAtBottom] = useState(true);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [listOverflowing, setListOverflowing] = useState(false);
  const [listAtBottom, setListAtBottom] = useState(true);

  useEffect(() => {
    const el = dropdownRef.current;
    if (!el) return;
    const update = () => {
      const isOverflow = el.scrollHeight > el.clientHeight + 1;
      setDropdownOverflowing(isOverflow);
      setDropdownAtBottom(
        !isOverflow || el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      );
    };
    update();
    const onScroll = () => update();
    el.addEventListener('scroll', onScroll);
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(update)
        : undefined;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [options]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => {
      const isOverflow = el.scrollHeight > el.clientHeight + 1;
      setListOverflowing(isOverflow);
      setListAtBottom(
        !isOverflow || el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      );
    };
    update();
    const onScroll = () => update();
    el.addEventListener('scroll', onScroll);
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(update)
        : undefined;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [options]);

  useEffect(() => {
    if (options && options.length === 1) {
      setValue(name, options[0].marketId.toString(), { shouldValidate: true });
    }
  }, [options, setValue, name]);

  if (!options || options.length === 0) {
    return (
      <div className="text-muted-foreground py-4">
        No options available for this market.
      </div>
    );
  }

  if (variant === 'dropdown') {
    return (
      <div className="mt-2">
        <Select
          value={value}
          onValueChange={(newValue) => {
            setValue(name, newValue, { shouldValidate: true });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent
            ref={dropdownRef}
            className={`relative ${
              dropdownOverflowing ? 'overflow-y-scroll' : 'overflow-y-auto'
            } ${dropdownOverflowing && !dropdownAtBottom ? 'border-b' : ''}`}
          >
            {options
              .slice()
              .sort((a, b) => a.marketId - b.marketId)
              .map(({ name: optionName, marketId }) => (
                <SelectItem key={marketId} value={marketId.toString()}>
                  <div
                    className="inline-block relative"
                    style={{ perspective: 800 }}
                  >
                    <motion.div
                      animate={{ rotateX: effectiveFlipped ? 180 : 0 }}
                      transition={{ duration: 0.3, ease: [0.65, 0, 0.35, 1] }}
                      style={{
                        transformStyle: 'preserve-3d',
                        position: 'relative',
                      }}
                    >
                      <div
                        className="truncate"
                        style={{ backfaceVisibility: 'hidden' }}
                      >
                        {optionName}
                      </div>
                      <div
                        className="absolute inset-0 truncate"
                        style={{
                          backfaceVisibility: 'hidden',
                          transform: 'rotateX(180deg)',
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="destructive">NOT</Badge>
                          <span className="truncate">{optionName}</span>
                        </span>
                      </div>
                    </motion.div>
                  </div>
                </SelectItem>
              ))}
            {dropdownOverflowing && !dropdownAtBottom && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent" />
            )}
          </SelectContent>
        </Select>

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(name)} />
      </div>
    );
  }

  const sortedOptions = useMemo(
    () => options.slice().sort((a, b) => a.marketId - b.marketId),
    [options]
  );

  return (
    <div className="space-y-4">
      <div
        ref={listRef}
        className={`md:max-h-[175px] pr-1 relative ${
          listOverflowing ? 'md:overflow-y-scroll' : 'md:overflow-y-auto'
        } ${listOverflowing && !listAtBottom ? 'border-b' : ''}`}
      >
        <div className="grid grid-cols-1 gap-2 mt-2">
          {sortedOptions.map(({ name: optionName, marketId }, idx) => {
            const isSelected = value === marketId.toString();
            const seriesColor = getSeriesColorByIndex(idx);
            const unselectedBg = withAlpha(seriesColor, 0.08);
            const hoverBg = withAlpha(seriesColor, 0.16);
            const borderColor = withAlpha(seriesColor, 0.24);

            return (
              <div
                key={marketId}
                className="relative"
                style={{ perspective: 1000 }}
              >
                <motion.div
                  animate={{ rotateX: effectiveFlipped ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: [0.65, 0, 0.35, 1] }}
                  style={{
                    transformStyle: 'preserve-3d',
                    position: 'relative',
                  }}
                >
                  {/* Front face */}
                  <Button
                    type="button"
                    onClick={() => {
                      setValue(name, marketId.toString(), {
                        shouldValidate: true,
                      });
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    className={`w-full text-center justify-start font-normal border flex items-center gap-3 text-foreground`}
                    style={{
                      backgroundColor: unselectedBg,
                      borderColor,
                      backfaceVisibility: 'hidden',
                    }}
                    onMouseEnter={(e) => {
                      (
                        e.currentTarget as HTMLButtonElement
                      ).style.backgroundColor = hoverBg;
                    }}
                    onMouseLeave={(e) => {
                      (
                        e.currentTarget as HTMLButtonElement
                      ).style.backgroundColor = unselectedBg;
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center rounded-full"
                      style={{
                        width: 16,
                        height: 16,
                        border: `2px solid ${seriesColor}`,
                      }}
                      aria-hidden
                    >
                      {isSelected ? (
                        <span
                          className="block rounded-full"
                          style={{
                            width: 8,
                            height: 8,
                            backgroundColor: seriesColor,
                          }}
                        />
                      ) : null}
                    </span>
                    <span className="truncate">{optionName}</span>
                  </Button>

                  {/* Back face */}
                  <Button
                    type="button"
                    onClick={() => {
                      setValue(name, marketId.toString(), {
                        shouldValidate: true,
                      });
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    className={`w-full text-center justify-start font-normal border flex items-center gap-3 text-foreground absolute inset-0`}
                    style={{
                      backgroundColor: unselectedBg,
                      borderColor,
                      transform: 'rotateX(180deg)',
                      backfaceVisibility: 'hidden',
                      pointerEvents: effectiveFlipped ? 'auto' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      (
                        e.currentTarget as HTMLButtonElement
                      ).style.backgroundColor = hoverBg;
                    }}
                    onMouseLeave={(e) => {
                      (
                        e.currentTarget as HTMLButtonElement
                      ).style.backgroundColor = unselectedBg;
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center rounded-full"
                      style={{
                        width: 16,
                        height: 16,
                        border: `2px solid ${seriesColor}`,
                      }}
                      aria-hidden
                    >
                      {isSelected ? (
                        <span
                          className="block rounded-full"
                          style={{
                            width: 8,
                            height: 8,
                            backgroundColor: seriesColor,
                          }}
                        />
                      ) : null}
                    </span>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <Badge variant="destructive">NOT</Badge>
                      <span className="truncate">{optionName}</span>
                    </span>
                  </Button>
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(name)} />
      </div>
    </div>
  );
}
