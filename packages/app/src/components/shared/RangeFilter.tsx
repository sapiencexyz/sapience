'use client';

import * as React from 'react';
import Slider from '@sapience/ui/components/ui/slider';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { ChevronsUpDown } from 'lucide-react';

export interface RangeFilterProps {
  placeholder: string;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  parseValue?: (value: string) => number;
  unit?: string;
  showSign?: boolean;
  // Custom label to show for specific value ranges
  customLabels?: Array<{ range: [number, number]; label: string }>;
}

export function RangeFilter({
  placeholder,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue = (v) => String(v),
  parseValue = (v) => Number(v),
  unit,
  showSign = false,
  customLabels,
}: RangeFilterProps) {
  const [open, setOpen] = React.useState(false);

  const [localMin, setLocalMin] = React.useState(formatValue(value[0]));
  const [localMax, setLocalMax] = React.useState(formatValue(value[1]));

  // Sync local state when numeric value changes (not on formatValue reference change)
  React.useEffect(() => {
    setLocalMin(formatValue(value[0]));
    setLocalMax(formatValue(value[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value[0], value[1]]);

  const handleSliderChange = (newValue: number[]) => {
    if (newValue.length >= 2) {
      onChange([newValue[0], newValue[1]]);
    }
  };

  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalMin(e.target.value);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalMax(e.target.value);
  };

  const handleMinBlur = () => {
    const parsed = parseValue(localMin);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(parsed, value[1]));
      onChange([clamped, value[1]]);
    } else {
      setLocalMin(formatValue(value[0]));
    }
  };

  const handleMaxBlur = () => {
    const parsed = parseValue(localMax);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(parsed, value[0]));
      onChange([value[0], clamped]);
    } else {
      setLocalMax(formatValue(value[1]));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const isAtBounds = value[0] === min && value[1] === max;

  const formatDisplay = (v: number) => {
    const formatted = formatValue(v);
    if (showSign && v > 0 && formatted !== '∞') return `+${formatted}`;
    return formatted;
  };

  const getButtonLabel = (): string => {
    if (isAtBounds) {
      return placeholder;
    }

    // Check for custom labels first
    if (customLabels) {
      const matchedLabel = customLabels.find(
        ({ range }) => value[0] === range[0] && value[1] === range[1]
      );
      if (matchedLabel) {
        return matchedLabel.label;
      }
    }

    const minDisplay = formatDisplay(value[0]);
    const maxDisplay = formatDisplay(value[1]);
    const unitSuffix = unit ? ` ${unit}` : '';

    // Upper bound at infinity: show "≥X" format
    if (value[1] === max && maxDisplay === '∞') {
      return `≥${minDisplay}${unitSuffix}`;
    }

    // Lower bound at negative infinity: show "≤X" format
    if (value[0] === min && formatValue(min) === '-∞') {
      return `≤${maxDisplay}${unitSuffix}`;
    }

    return `${minDisplay} → ${maxDisplay}${unitSuffix}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left inline-flex items-center justify-between px-3 text-sm"
        >
          <span className={isAtBounds ? 'text-muted-foreground' : ''}>
            {getButtonLabel()}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-4" align="start">
        <div className="flex flex-col gap-4">
          <div className="px-1">
            <Slider
              value={[value[0], value[1]]}
              onValueChange={handleSliderChange}
              min={min}
              max={max}
              step={step}
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                inputSize="xs"
                type="text"
                value={localMin}
                onChange={handleMinInputChange}
                onBlur={handleMinBlur}
                onKeyDown={handleKeyDown}
                className="w-full pr-10 text-right font-mono text-xs tabular-nums"
              />
              {unit && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                  {unit}
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-xs">to</span>
            <div className="relative flex-1">
              <Input
                inputSize="xs"
                type="text"
                value={localMax}
                onChange={handleMaxInputChange}
                onBlur={handleMaxBlur}
                onKeyDown={handleKeyDown}
                className="w-full pr-10 text-right font-mono text-xs tabular-nums"
              />
              {unit && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                  {unit}
                </span>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default RangeFilter;
