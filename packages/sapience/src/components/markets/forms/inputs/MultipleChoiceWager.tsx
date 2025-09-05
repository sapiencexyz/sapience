import { Button } from '@sapience/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { useFormContext } from 'react-hook-form';
import { useEffect, useRef, useState } from 'react';

interface MultipleChoicePredictProps {
  name?: string;
  options: Array<{ name: string; marketId: number }>;
  variant?: 'buttons' | 'dropdown';
  defaultValue?: string;
}

export default function MultipleChoiceWagerChoiceSelect({
  name = 'predictionValue',
  options,
  variant = 'buttons',
  defaultValue,
}: MultipleChoicePredictProps) {
  const { register, setValue, watch } = useFormContext();
  const value = watch(name) ?? defaultValue;

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
                  {optionName}
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

  return (
    <div className="space-y-4">
      <div
        ref={listRef}
        className={`md:max-h-[175px] pr-1 relative ${
          listOverflowing ? 'md:overflow-y-scroll' : 'md:overflow-y-auto'
        } ${listOverflowing && !listAtBottom ? 'border-b' : ''}`}
      >
        <div className="grid grid-cols-1 gap-2 mt-2">
          {options
            .slice()
            .sort((a, b) => a.marketId - b.marketId)
            .map(({ name: optionName, marketId }) => (
              <Button
                key={marketId}
                type="button"
                onClick={() => {
                  setValue(name, marketId.toString(), { shouldValidate: true });
                }}
                className={`text-center justify-start font-normal ${
                  value === marketId.toString()
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {optionName}
              </Button>
            ))}
        </div>

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(name)} />
      </div>
    </div>
  );
}
