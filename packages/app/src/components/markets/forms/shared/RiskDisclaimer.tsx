'use client';

import { AlertTriangle } from 'lucide-react';

interface RiskDisclaimerProps {
  className?: string;
  message?: string;
}

export default function RiskDisclaimer({
  className,
  message = 'Do not risk more than you can afford to lose',
}: RiskDisclaimerProps) {
  return (
    <div className={`text-xs text-foreground text-center ${className || ''}`}>
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="inline-block align-top w-3.5 h-3.5" />
        <span className="font-medium">{message}</span>
      </span>
    </div>
  );
}
