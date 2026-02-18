'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import * as React from 'react';

import { cn } from '../../lib/utils';

const ThumbElement = () => (
  <SliderPrimitive.Thumb asChild>
    <span
      className="relative flex h-7 w-[14px] items-center justify-center rounded-sm border cursor-pointer ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        backgroundColor: 'hsl(var(--brand-black, var(--background)))',
        borderColor: 'hsl(var(--foreground, var(--brand-white)))',
      }}
    >
      <span
        className="pointer-events-none flex h-full w-[4px] items-center justify-between"
        aria-hidden
      >
        <span
          className="block h-[65%] w-px rounded-full"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.55)',
          }}
        />
        <span
          className="block h-[65%] w-px rounded-full"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.55)',
          }}
        />
      </span>
    </span>
  </SliderPrimitive.Thumb>
);

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, defaultValue, value, ...props }, ref) => {
  // Determine number of thumbs based on value or defaultValue
  const thumbCount = value?.length ?? defaultValue?.length ?? 1;

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        className
      )}
      defaultValue={defaultValue}
      value={value}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range
          className="absolute h-full"
          style={{ backgroundColor: 'hsl(var(--foreground, var(--primary)))' }}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }).map((_, index) => (
        <ThumbElement key={index} />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export default Slider;
