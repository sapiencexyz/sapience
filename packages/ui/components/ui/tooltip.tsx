'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * Lightweight coarse-pointer detection. We favor pointer-coarse over width.
 * Safe for SSR: defaults to false until hydrated.
 */
function useIsCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = React.useState(false);

  React.useEffect(() => {
    try {
      const hasTouch =
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
        (typeof window !== 'undefined' &&
          'ontouchstart' in (window as unknown as { ontouchstart?: unknown })) ||
        (typeof window !== 'undefined' &&
          window.matchMedia &&
          window.matchMedia('(pointer: coarse)').matches);
      setIsCoarse(!!hasTouch);
    } catch (_e) {
      setIsCoarse(false);
    }
  }, []);

  return isCoarse;
}

const TooltipProvider = TooltipPrimitive.Provider;

type TooltipVariant = 'tooltip' | 'popover';

const TooltipVariantContext = React.createContext<TooltipVariant | null>(null);

type TooltipProps = TooltipPrimitive.TooltipProps & {
  /**
   * Force using desktop Tooltip behavior even on touch devices.
   */
  forceTooltipOnTouch?: boolean;
};

const Tooltip = ({
  children,
  delayDuration = 0,
  forceTooltipOnTouch = false,
  open,
  defaultOpen,
  onOpenChange,
  ..._props
}: TooltipProps) => {
  const isCoarse = useIsCoarsePointer();
  const usePopover = isCoarse && !forceTooltipOnTouch;
  const variant: TooltipVariant = usePopover ? 'popover' : 'tooltip';

  const root = usePopover ? (
    <PopoverPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {children}
    </PopoverPrimitive.Root>
  ) : (
    <TooltipPrimitive.Root
      delayDuration={delayDuration}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {children}
    </TooltipPrimitive.Root>
  );

  return (
    <TooltipVariantContext.Provider value={variant}>{root}</TooltipVariantContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ children, ...props }, ref) => {
  const variant = React.useContext(TooltipVariantContext);

  if (variant === 'popover') {
    return (
      <PopoverPrimitive.Trigger ref={ref as unknown as React.Ref<HTMLButtonElement>} {...(props as any)}>
        {children}
      </PopoverPrimitive.Trigger>
    );
  }

  // Default to Tooltip trigger if no context or explicitly tooltip
  return (
    <TooltipPrimitive.Trigger ref={ref} {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, side = 'top', align, sideOffset = 4, ...props }, ref) => {
  const variant = React.useContext(TooltipVariantContext);

  const contentClasses = cn(
    'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
    className
  );

  if (variant === 'popover') {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref as unknown as React.Ref<HTMLDivElement>}
          side={side as any}
          align={align as any}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={cn(
            // Content-hugging width; allow wrapping
            'inline-block w-auto break-words whitespace-normal',
            contentClasses
          )}
          style={{
            maxWidth: 'min(88dvw, 280px)',
            ...(props as any)?.style,
          }}
          {...(props as any)}
        />
      </PopoverPrimitive.Portal>
    );
  }

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={contentClasses}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
