import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const inputVariants = cva(
  'flex w-full rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      inputSize: {
        default: 'h-10 px-3 py-2 text-sm',
        sm: 'h-9 px-3 py-1.5 text-sm',
        xs: 'h-7 px-2 py-1 text-xs',
        lg: 'h-11 px-4 py-3 text-base',
      },
    },
    defaultVariants: {
      inputSize: 'default',
    },
  }
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  endAdornment?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, endAdornment, inputSize, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        <input
          type={type}
          className={cn(inputVariants({ inputSize }), 'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground', className)}
          ref={ref}
          {...props}
        />
        {endAdornment && <div className="absolute right-0">{endAdornment}</div>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
