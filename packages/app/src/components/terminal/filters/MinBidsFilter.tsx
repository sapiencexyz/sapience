'use client';

import type React from 'react';
import { RangeFilter } from '~/components/shared/RangeFilter';

type Props = {
  value: [number, number];
  onChange: (v: [number, number]) => void;
};

const SLIDER_MAX = 100;

const MinBidsFilter: React.FC<Props> = ({ value, onChange }) => {
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
      placeholder="All Bid Counts"
      value={sliderValue}
      onChange={handleChange}
      min={0}
      max={SLIDER_MAX}
      step={1}
      formatValue={(v) => (v >= SLIDER_MAX ? '∞' : String(v))}
      parseValue={(v) => {
        if (v === '∞') return SLIDER_MAX;
        return Number(v);
      }}
      unit="bids"
      customLabels={[{ range: [1, SLIDER_MAX], label: '≥1 Bids' }]}
    />
  );
};

export default MinBidsFilter;
