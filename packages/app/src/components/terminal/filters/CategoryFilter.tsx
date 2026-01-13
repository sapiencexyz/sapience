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
};

const CategoryFilter: React.FC<Props> = ({ items, selected, onChange }) => {
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
      placeholder="All Focus Areas"
      items={memoItems}
      selected={memoSelected}
      onChange={onChange}
      renderItemContent={(item) => {
        const slug = item.value;
        const Icon = getCategoryIcon(slug);
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
                backgroundColor:
                  slug === 'prices'
                    ? 'hsl(var(--brand-white) / 0.1)'
                    : withAlpha(color || 'hsl(var(--muted))', 0.14),
              }}
            >
              {slug === 'prices' ? (
                <Icon className="h-3 w-3 text-foreground" />
              ) : (
                <Icon className="h-3 w-3" style={{ strokeWidth: 1, color }} />
              )}
            </span>
            <span>{item.label}</span>
          </>
        );
      }}
      renderTriggerContent={(selected) => {
        const visible = selected.slice(0, 3);
        return (
          <span className="inline-flex items-center gap-1">
            {visible.map((slug) => {
              const Icon = getCategoryIcon(slug);
              const color = getCategoryStyle(slug)?.color;
              return (
                <span
                  key={slug}
                  className="inline-flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 18,
                    height: 18,
                    minWidth: 18,
                    minHeight: 18,
                    backgroundColor:
                      slug === 'prices'
                        ? 'hsl(var(--brand-white) / 0.1)'
                        : withAlpha(color || 'hsl(var(--muted))', 0.14),
                  }}
                >
                  {slug === 'prices' ? (
                    <Icon className="h-2.5 w-2.5 text-foreground" />
                  ) : (
                    <Icon
                      className="h-2.5 w-2.5"
                      style={{ strokeWidth: 1, color }}
                    />
                  )}
                </span>
              );
            })}
            {selected.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{selected.length - 3}
              </span>
            )}
          </span>
        );
      }}
    />
  );
};

export default CategoryFilter;
