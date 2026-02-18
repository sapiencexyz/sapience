'use client';

import type React from 'react';
import { useDeferredValue, useMemo } from 'react';
import MultiSelect, { type MultiSelectItem } from './MultiSelect';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';

type Props = {
  items: MultiSelectItem[];
  selected: string[];
  onChange: (values: string[]) => void;
  categoryById?: Record<string, string | null | undefined>;
  placeholder?: string;
  triggerClassName?: string;
  alwaysShowPlaceholder?: boolean;
  size?: 'default' | 'compact';
  matchTriggerWidth?: boolean;
  closeOnSelect?: boolean;
};

const ConditionsFilter: React.FC<Props> = ({
  items,
  selected,
  onChange,
  categoryById,
  placeholder = 'All Questions',
  triggerClassName,
  alwaysShowPlaceholder = false,
  size = 'compact',
  matchTriggerWidth = false,
  closeOnSelect = false,
}) => {
  const deferredItems = useDeferredValue(items);
  const deferredSelected = useDeferredValue(selected);
  const memoItems = useMemo(() => deferredItems, [deferredItems]);
  const memoSelected = useMemo(() => deferredSelected, [deferredSelected]);

  const withAlpha = (color: string, alpha: number): string => {
    const hexMatch = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
    if (hexMatch.test(color)) {
      const a = Math.max(0, Math.min(1, alpha));
      const aHex = Math.round(a * 255)
        .toString(16)
        .padStart(2, '0');
      return `${color}${aHex}`;
    }
    const toSlashAlpha = (fn: 'hsl' | 'rgb', inside: string) =>
      `${fn}(${inside} / ${alpha})`;
    if (color.startsWith('hsl('))
      return toSlashAlpha('hsl', color.slice(4, -1));
    if (color.startsWith('rgb('))
      return toSlashAlpha('rgb', color.slice(4, -1));
    return color;
  };

  return (
    <MultiSelect
      placeholder={placeholder}
      items={memoItems}
      selected={memoSelected}
      onChange={onChange}
      className={triggerClassName}
      alwaysShowPlaceholder={alwaysShowPlaceholder}
      size={size}
      matchTriggerWidth={matchTriggerWidth}
      closeOnSelect={closeOnSelect}
      enableSearch
      emptyMessage="No predictions yet"
      renderItemContent={(item) => {
        const slug = categoryById?.[item.value] || null;
        const Icon = getCategoryIcon(slug ?? undefined);
        const color = getCategoryStyle(slug)?.color;
        return (
          <>
            <span
              className="inline-flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 22,
                height: 22,
                minWidth: 22,
                minHeight: 22,
                backgroundColor: withAlpha(color || 'hsl(var(--muted))', 0.14),
              }}
            >
              <Icon className="h-3 w-3" style={{ strokeWidth: 1, color }} />
            </span>
            <span className="font-mono text-xs text-brand-white">
              {item.label}
            </span>
          </>
        );
      }}
      renderTriggerContent={(sel) => {
        if (sel.length === 0) return null;
        const n = sel.length;
        return `${n} ${n === 1 ? 'prediction' : 'predictions'} selected`;
      }}
    />
  );
};

export default ConditionsFilter;
