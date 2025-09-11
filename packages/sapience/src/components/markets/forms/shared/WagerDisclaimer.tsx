'use client';

import { AlertTriangle } from 'lucide-react';

interface WagerDisclaimerProps {
  className?: string;
  message?: string;
}

export default function WagerDisclaimer({
  className,
  message = 'Do not wager more than you can afford to lose',
}: WagerDisclaimerProps) {
  return (
    <div
      className={`text-xs text-muted-foreground text-center ${className || ''}`}
    >
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="inline-block align-top w-3.5 h-3.5" />
        <span className="font-medium">{message}</span>
      </span>
    </div>
  );
}
