'use client';

import * as React from 'react';
import { TabsList } from '@sapience/sdk/ui/components/ui/tabs';
import { cn } from '@sapience/sdk/ui/lib/utils';

interface SegmentedTabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsList> {
  primaryColor?: string;
  triggerClassName?: string;
  // Optional radius class overrides
  containerRadiusClassName?: string; // defaults to rounded-xl
  triggerRadiusClassName?: string; // defaults to rounded-md
}

// Supports CSS variable-based colors (e.g., "hsl(var(--primary))") by returning
// slash-alpha syntax for hsl/rgb strings; falls back to the original color.
function withAlpha(color: string, alpha: number): string {
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
  if (color.startsWith('hsl(')) return toSlashAlpha('hsl', color.slice(4, -1));
  if (color.startsWith('rgb(')) return toSlashAlpha('rgb', color.slice(4, -1));
  return color;
}

/**
 * SegmentedTabsList applies the shared segmented control styling used across the app.
 * It automatically enhances child TabsTrigger elements with the proper classes and
 * CSS variables to render the subtle primary-tinted background and active states.
 */
export const SegmentedTabsList: React.FC<SegmentedTabsListProps> = ({
  className,
  children,
  primaryColor = 'hsl(var(--primary))',
  triggerClassName,
  containerRadiusClassName,
  triggerRadiusClassName,
  ...rest
}) => {
  const segBg = withAlpha(primaryColor, 0.05);
  const segActiveBg = withAlpha(primaryColor, 0.09);
  const containerRadius = containerRadiusClassName || 'rounded-md';
  const triggerRadius = triggerRadiusClassName || 'rounded-sm';

  const enhancedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    // Merge/append the shared trigger classes to TabsTrigger children
    const childClassName = (child.props as any)?.className as
      | string
      | undefined;
    const mergedClassName = cn(
      'text-sm px-3 h-8 leading-none data-[state=active]:bg-[var(--seg-active)]',
      triggerRadius,
      triggerClassName,
      childClassName
    );
    return React.cloneElement(
      child as React.ReactElement<any>,
      {
        className: mergedClassName,
        style: {
          ...(child.props as any)?.style,
          ['--seg-active' as any]: segActiveBg,
        },
      } as any
    );
  });

  return (
    <TabsList
      className={cn(
        'inline-flex items-center p-1 bg-[var(--seg-bg)]',
        containerRadius,
        className
      )}
      style={{ ['--seg-bg' as any]: segBg }}
      {...rest}
    >
      {enhancedChildren}
    </TabsList>
  );
};

export default SegmentedTabsList;
