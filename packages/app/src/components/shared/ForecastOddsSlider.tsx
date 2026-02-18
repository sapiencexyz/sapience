import { useMemo, type ReactNode } from 'react';

import { Label } from '@sapience/ui/components/ui/label';
import Slider from '@sapience/ui/components/ui/slider';

import { formatPercentChance } from '~/lib/format/percentChance';
import { cn } from '~/lib/utils/util';

type ForecastOddsSliderProps = {
  value: number;
  onChange: (nextValue: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  renderHeader?: (value: number) => ReactNode;
};

const clampPercentage = (value: number) => {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
};

const ForecastOddsSlider = ({
  value,
  onChange,
  disabled = false,
  label = 'Forecast',
  className,
  renderHeader,
}: ForecastOddsSliderProps) => {
  const safeValue = useMemo(() => clampPercentage(value), [value]);

  const handleSliderChange = (nextValues: number[]) => {
    const [next] = nextValues;
    if (typeof next === 'number' && Number.isFinite(next)) {
      onChange(clampPercentage(next));
    }
  };

  const headerContent = renderHeader?.(safeValue);

  return (
    <div className={cn('space-y-2.5', className)}>
      {headerContent ?? (
        <Label className="text-lg font-normal">
          <span className="text-muted-foreground">{label}:</span>{' '}
          <span className="font-mono text-ethena text-lg">
            {formatPercentChance(safeValue / 100)} chance
          </span>
        </Label>
      )}
      <Slider
        value={[safeValue]}
        onValueChange={handleSliderChange}
        max={100}
        min={0}
        step={1}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
};

export default ForecastOddsSlider;
