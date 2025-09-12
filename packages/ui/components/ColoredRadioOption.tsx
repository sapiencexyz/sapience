import * as React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export interface ColoredRadioOptionProps {
  label: React.ReactNode;
  color: string; // hex color like #4ADE80
  checked: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
}

function withAlpha(hexColor: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const alphaByte = Math.round(a * 255);
  const alphaHex = alphaByte.toString(16).padStart(2, '0');
  const normalized = hexColor.replace('#', '').trim();
  const base = normalized.length === 8 ? normalized.slice(0, 6) : normalized;
  return `#${base}${alphaHex}`;
}

export const ColoredRadioOption: React.FC<ColoredRadioOptionProps> = ({
  label,
  color,
  checked,
  onClick,
  className,
  disabled,
}) => {
  const unselectedBg = withAlpha(color, 0.08);
  const hoverBg = withAlpha(color, 0.16);
  const borderColor = withAlpha(color, 0.24);

  return (
    <Button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'text-center justify-start font-normal border flex items-center gap-3 text-foreground',
        className
      )}
      style={{
        backgroundColor: unselectedBg,
        borderColor,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = unselectedBg;
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 16,
          height: 16,
          border: `2px solid ${color}`,
        }}
        aria-hidden
      >
        {checked ? (
          <span
            className="block rounded-full"
            style={{
              width: 8,
              height: 8,
              backgroundColor: color,
            }}
          />
        ) : null}
      </span>
      <span className="truncate">{label}</span>
    </Button>
  );
};

export default ColoredRadioOption;


