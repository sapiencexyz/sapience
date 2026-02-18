'use client';

import type React from 'react';
import { RangeFilter } from '~/components/shared/RangeFilter';

type Props = {
  value: [number, number];
  onChange: (v: [number, number]) => void;
  unit?: string;
};

const SLIDER_MAX = 1000;

const MinPositionSizeFilter: React.FC<Props> = ({
  value,
  onChange,
  unit = 'USDC',
}) => {
  // Map Infinity to slider max for display, and back
  const sliderValue: [number, number] = [
    value[0],
    value[1] === Infinity ? SLIDER_MAX : Math.min(value[1], SLIDER_MAX),
  ];

  const handleChange = (v: [number, number]) => {
    onChange([v[0], v[1] >= SLIDER_MAX ? Infinity : v[1]]);
  };

  return (
    <RangeFilter
      placeholder="Any size"
      value={sliderValue}
      onChange={handleChange}
      min={0}
      max={SLIDER_MAX}
      step={1}
      formatValue={(v) => (v >= SLIDER_MAX ? '∞' : v.toLocaleString())}
      parseValue={(v) => {
        if (v === '∞') return SLIDER_MAX;
        return Number(v.replace(/,/g, ''));
      }}
      unit={unit}
      customLabels={[{ range: [1, SLIDER_MAX], label: `≥1 ${unit} size` }]}
    />
  );
};

export default MinPositionSizeFilter;
