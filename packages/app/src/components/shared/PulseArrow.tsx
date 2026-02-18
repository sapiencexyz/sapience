'use client';

import { ArrowRight } from 'lucide-react';

type PulseArrowProps = {
  className?: string;
  delay?: number;
  strokeWidth?: number;
};

export default function PulseArrow({
  className = '',
  delay = 0,
  strokeWidth = 1.25,
}: PulseArrowProps) {
  return (
    <ArrowRight
      className={`text-accent-gold opacity-50 animate-arrow-pulse ${className}`}
      aria-hidden="true"
      strokeWidth={strokeWidth}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    />
  );
}
