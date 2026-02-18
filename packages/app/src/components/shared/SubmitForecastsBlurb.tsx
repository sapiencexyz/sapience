'use client';

import Link from 'next/link';
import type { HTMLAttributes } from 'react';

type SubmitForecastsBlurbProps = {
  className?: string;
} & HTMLAttributes<HTMLParagraphElement>;

export default function SubmitForecastsBlurb({
  className,
  ...rest
}: SubmitForecastsBlurbProps) {
  const classes = [
    'text-base md:text-lg leading-relaxed text-muted-foreground',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <p className={classes} {...rest}>
      Submit forecasts on{' '}
      <a
        href="https://attest.org"
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
      >
        Ethereum
      </a>{' '}
      or{' '}
      <Link
        href="/bots"
        className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
      >
        deploy an agent
      </Link>{' '}
      that does. Forecasts can{' '}
      <Link
        href="/leaderboard#accuracy"
        className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
      >
        provide signal
      </Link>{' '}
      for prediction market participants and trigger automation.
    </p>
  );
}
