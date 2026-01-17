'use client';

import * as React from 'react';
import Link from 'next/link';
import { getQuestionHref } from '~/lib/utils/questionHref';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';

type ConditionTitleLinkProps = {
  conditionId?: string;
  resolverAddress?: string;
  title: string;
  className?: string;
  /**
   * When null, allow natural wrapping with no ellipsis.
   * When 1, single-line with ellipsis.
   * When >1, apply Webkit line clamp to that many lines.
   */
  clampLines?: number | null;
  /**
   * Optional element to render immediately after the title (e.g., a Badge).
   */
  trailing?: React.ReactNode;
  /**
   * Force a single unbroken line without ellipsis or clipping.
   * Useful for horizontally scrolling tickers where items can exceed viewport width.
   */
  noWrap?: boolean;
  /**
   * Optional end time for the condition (currently unused but accepted for API consistency).
   */
  endTime?: number | null;
  /**
   * Optional description for the condition (currently unused but accepted for API consistency).
   */
  description?: string | null;
};

export default function ConditionTitleLink({
  conditionId,
  resolverAddress,
  title,
  className,
  clampLines = 1,
  trailing,
  noWrap = false,
}: ConditionTitleLinkProps) {
  // Compute style based on clamp behavior
  const linkStyle: React.CSSProperties = React.useMemo(() => {
    if (noWrap) {
      return { whiteSpace: 'nowrap' };
    }

    if (clampLines == null) {
      return {};
    }

    if (clampLines === 1) {
      return {
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      };
    }

    // Multi-line clamp
    return {
      display: '-webkit-box',
      WebkitLineClamp: clampLines,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    };
  }, [clampLines, noWrap]);

  // Base clickable styles; prefer text underline for natural width and stable baseline
  // Dotted underline is brighter by default, dims on hover for subtle interaction feedback
  const baseClickableClass = React.useMemo(() => {
    const shared = 'font-mono text-brand-white transition-colors break-words';
    const underlineStyle =
      'underline decoration-dotted decoration-1 decoration-brand-white/70 underline-offset-4 hover:decoration-brand-white/40';
    const base = `p-0 m-0 bg-transparent ${shared} ${underlineStyle}`;

    if (noWrap) {
      return `inline align-baseline ${base} whitespace-nowrap`;
    }

    if (clampLines === 1) {
      // Single-line clamp: use block display so ellipsis works properly
      return `block max-w-full ${base} whitespace-nowrap`;
    }

    // Wrap mode or multi-line clamp: inline so trailing can appear after final word
    return `inline align-baseline ${base} whitespace-normal`;
  }, [noWrap, clampLines]);

  // Build the href for the questions page
  const href = getQuestionHref({ conditionId, resolverAddress });

  // Wrapper display: block for single-line clamp, inline otherwise
  const wrapperDisplay = clampLines === 1 ? 'block' : 'inline align-baseline';

  // Only show tooltip when text might be truncated (clamped)
  const showTooltip = clampLines != null && !noWrap;

  const linkElement = (
    <Link
      href={href}
      className={`${baseClickableClass} min-w-0 max-w-full`}
      style={linkStyle}
    >
      {title}
    </Link>
  );

  return (
    <span className={`${wrapperDisplay} min-w-0 max-w-full ${className ?? ''}`}>
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-xs text-xs whitespace-normal break-words"
          >
            {title}
          </TooltipContent>
        </Tooltip>
      ) : (
        linkElement
      )}
      {trailing ? (
        <>
          {' '}
          <span className="ml-1 align-baseline">{trailing}</span>
        </>
      ) : null}
    </span>
  );
}
