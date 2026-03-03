'use client';

import * as React from 'react';
import { formatEther } from 'viem';
import { motion } from 'framer-motion';
import ConditionTitleLink from '../ConditionTitleLink';
import { type TopLevelRow, EndTimeCell, PredictCell } from '../market-helpers';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { formatPercentChance } from '~/lib/format/percentChance';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 24 },
  },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

// ---------------------------------------------------------------------------
// Visual elements (SVG gauges use raw hex for stroke colors)
// ---------------------------------------------------------------------------

/* eslint-disable no-restricted-syntax */
function gaugeStrokeColor(percent: number): string {
  if (percent < 15) return '#dc4a4a';
  if (percent > 85) return '#3aad6e';
  return '#2E5CFF';
}

function SemiCircleGaugeShell({
  percent,
  width = 56,
  children,
}: {
  percent: number | null;
  width?: number;
  children: React.ReactNode;
}) {
  const strokeWidth = 4.5;
  const r = (width - strokeWidth) / 2;
  const height = r + strokeWidth + 2;
  const cy = height - 2;
  const arcLength = Math.PI * r;
  const filled = percent != null ? (percent / 100) * arcLength : 0;
  const strokeColor = percent != null ? gaugeStrokeColor(percent) : '#2E5CFF';

  return (
    <div className="flex flex-col items-center shrink-0 -mt-1">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${r} ${r} 0 0 1 ${width - strokeWidth / 2} ${cy}`}
          fill="none"
          stroke="#dbe4ff"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {percent != null && (
          <path
            d={`M ${strokeWidth / 2} ${cy} A ${r} ${r} 0 0 1 ${width - strokeWidth / 2} ${cy}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${arcLength}`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        )}
      </svg>
      {children}
    </div>
  );
}

function OptionsCountGauge({
  count,
  width = 56,
}: {
  count: number;
  width?: number;
}) {
  const strokeWidth = 4.5;
  const r = (width - strokeWidth) / 2;
  const height = r + strokeWidth + 2;
  const cy = height - 2;

  return (
    <div className="flex flex-col items-center shrink-0 -mt-1">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${r} ${r} 0 0 1 ${width - strokeWidth / 2} ${cy}`}
          fill="none"
          stroke="#dbe4ff"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-[14px] font-bold text-royal-900 -mt-5">
        {count}
      </span>
      <span className="font-display text-[9px] font-semibold text-royal-400 leading-tight">
        options
      </span>
    </div>
  );
}

/* eslint-enable no-restricted-syntax */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatOI(oiWei: bigint): string {
  const etherValue = parseFloat(formatEther(oiWei));
  return etherValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// ConditionCard
// ---------------------------------------------------------------------------

interface ConditionCardProps {
  row: TopLevelRow & { kind: 'condition' };
  predictionMapRef: React.RefObject<Record<string, number>>;
  onPrediction: (conditionId: string, p: number) => void;
  variant?: 'default' | 'child';
}

function ConditionCard({
  row,
  predictionMapRef,
  onPrediction,
  variant = 'default',
}: ConditionCardProps) {
  const { condition } = row;
  const oiWei = BigInt(condition.openInterest || '0');
  const probability = predictionMapRef.current[condition.id];
  const percentLabel =
    probability != null ? formatPercentChance(probability) : null;
  // Numeric percent for gauge arc (clamped 1–99 to avoid fully-empty/full visual)
  const percent =
    probability != null
      ? Math.max(1, Math.min(99, Math.round(probability * 100)))
      : null;
  const CategoryIcon = getCategoryIcon(condition.category?.slug);

  const handlePrediction = React.useCallback(
    (p: number) => onPrediction(condition.id, p),
    [condition.id, onPrediction]
  );

  return (
    <motion.div
      variants={cardVariants}
      className={`market-card bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(66,99,235,0.10)] hover:border-royal-200 transition-[box-shadow,border-color] duration-200 flex flex-col ${
        variant === 'child' ? 'p-4 pb-3.5' : 'p-5 pb-4'
      }`}
    >
      {/* Top: category */}
      <div className="flex items-center gap-1.5">
        <CategoryIcon className="h-3 w-3 text-royal-400 shrink-0" />
        <span className="font-display text-[11px] font-semibold tracking-wider text-royal-500 uppercase truncate">
          {condition.category?.name ?? 'Uncategorized'}
        </span>
      </div>

      {/* Title + Gauge */}
      <div className="mt-2 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <ConditionTitleLink
            conditionId={condition.id}
            resolverAddress={condition.resolver ?? undefined}
            title={condition.question}
            clampLines={2}
            className="font-display text-[15px] font-semibold tracking-tight leading-snug"
          />
        </div>
        {!condition.settled && (
          <SemiCircleGaugeShell percent={percent}>
            {percentLabel != null ? (
              <div className="-mt-5 flex flex-col items-center">
                <span
                  className="font-display text-[14px] font-bold"
                  style={{ color: gaugeStrokeColor(percent!) }}
                >
                  {percentLabel}
                </span>
                <span className="font-display text-[9px] font-semibold text-royal-400 leading-tight">
                  chance
                </span>
              </div>
            ) : (
              <div className="-mt-5 flex flex-col items-center">
                <span className="font-display text-[14px] font-bold text-royal-900">
                  —
                </span>
                <MarketPredictionRequest
                  conditionId={condition.id}
                  prefetchedProbability={probability}
                  onPrediction={handlePrediction}
                  inline
                  requestLabel="Request"
                  chainId={condition.chainId}
                  resolverAddress={condition.resolver}
                  className="[&_.font-mono]:font-display [&_.font-mono]:font-semibold [&_.font-mono]:text-[9px] [&_button]:font-display [&_button]:font-semibold [&_button]:text-[9px] [&_button]:text-royal-500 [&_.animate-pulse]:font-display [&_.animate-pulse]:font-semibold [&_.animate-pulse]:text-[8px] [&_.animate-pulse]:text-royal-400"
                />
              </div>
            )}
          </SemiCircleGaugeShell>
        )}
      </div>

      {/* Spacer to push buttons to bottom */}
      <div className="flex-1" />

      {/* YES / NO */}
      <div className="mt-4">
        <PredictCell condition={condition} colorScheme="bold" />
      </div>

      {/* Bottom: OI left, end time right */}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-display text-[11px] text-gray-500 tabular-nums font-mono">
          <span className="font-semibold">{formatOI(oiWei)} USDe</span> Open
          Interest
        </span>
        <span className="font-display text-[11px] text-gray-500 shrink-0">
          {condition.endTime ? (
            <EndTimeCell
              endTime={condition.endTime}
              settled={!!condition.settled}
              resolvedToYes={condition.resolvedToYes}
              nonDecisive={condition.nonDecisive}
              variant="card"
            />
          ) : (
            '—'
          )}
        </span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GroupCard
// ---------------------------------------------------------------------------

interface GroupCardProps {
  row: TopLevelRow & { kind: 'group' };
  onToggleExpand: (groupId: number) => void;
}

function GroupCard({ row, onToggleExpand }: GroupCardProps) {
  const oiWei = row.openInterestWei;
  const endTime = row.maxEndTime;
  const CategoryIcon = getCategoryIcon(row.category?.slug);

  return (
    <motion.div
      variants={cardVariants}
      className="market-card bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(66,99,235,0.10)] hover:border-royal-200 transition-[box-shadow,border-color] duration-200 p-5 pb-4 flex flex-col"
    >
      {/* Top: category */}
      <div className="flex items-center gap-1.5">
        <CategoryIcon className="h-3 w-3 text-royal-400 shrink-0" />
        <span className="font-display text-[11px] font-semibold tracking-wider text-royal-500 uppercase truncate">
          {row.category?.name ?? 'Uncategorized'}
        </span>
      </div>

      {/* Title + Options gauge */}
      <div className="mt-2 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onToggleExpand(row.groupId)}
            className="text-left font-display text-[15px] font-semibold tracking-tight leading-snug text-brand-white underline decoration-dotted decoration-1 underline-offset-4 decoration-[rgba(46,92,255,0.25)] hover:decoration-[rgba(46,92,255,0.5)] transition-colors line-clamp-2"
          >
            {row.name}
          </button>
        </div>
        <OptionsCountGauge count={row.conditions.length} />
      </div>

      <div className="flex-1" />

      {/* Expand button */}
      <button
        type="button"
        onClick={() => onToggleExpand(row.groupId)}
        className="mt-4 w-full h-8 rounded-md font-display text-sm font-semibold tracking-wider uppercase transition-colors border border-royal-200 text-royal-600 bg-royal-50 hover:bg-royal-100 hover:text-royal-700 flex items-center justify-center gap-1.5"
      >
        SHOW OPTIONS
      </button>

      {/* Bottom: OI left, end time right */}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-display text-[11px] text-gray-500 tabular-nums font-mono">
          <span className="font-semibold">{formatOI(oiWei)} USDe</span> Open
          Interest
        </span>
        <span className="font-display text-[11px] text-gray-500 shrink-0">
          {endTime ? (
            <EndTimeCell
              endTime={endTime}
              settled={row.conditions.every((c) => c.settled)}
              allSettled={row.conditions.every((c) => c.settled)}
              variant="card"
            />
          ) : (
            '—'
          )}
        </span>
      </div>
    </motion.div>
  );
}

export { ConditionCard, GroupCard, cardVariants, staggerContainer };
export type { ConditionCardProps, GroupCardProps };
