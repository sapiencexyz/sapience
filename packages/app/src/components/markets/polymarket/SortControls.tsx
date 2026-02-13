'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import type {
  SortField,
  SortDirection,
} from '~/hooks/graphql/useInfiniteQuestions';

interface SortControlsProps {
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
}

export default function SortControls({
  sortField,
  sortDirection,
  onSortChange,
}: SortControlsProps) {
  const handleClick = (field: SortField) => {
    if (sortField === field) {
      onSortChange(field, sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      onSortChange(field, 'desc');
    }
  };

  const ArrowIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <span className="flex flex-col -my-1 opacity-40">
          <ChevronUp className="h-3 w-3 -mb-1.5" />
          <ChevronDown className="h-3 w-3" />
        </span>
      );
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5" />
    );
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-display text-[11px] font-semibold tracking-wider text-white/50 uppercase ml-2">
        Sort by
      </span>
      <div className="flex items-center h-8 rounded-full bg-white/10 p-0.5">
        <button
          type="button"
          onClick={() => handleClick('openInterest')}
          className={`inline-flex items-center gap-1 h-full px-4 rounded-full font-display text-sm font-semibold tracking-[0.02em] transition-colors ${
            sortField === 'openInterest'
              ? 'bg-white/20 text-white'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Open Interest
          <ArrowIcon field="openInterest" />
        </button>
        <button
          type="button"
          onClick={() => handleClick('endTime')}
          className={`inline-flex items-center gap-1 h-full px-4 rounded-full font-display text-sm font-semibold tracking-[0.02em] transition-colors ${
            sortField === 'endTime'
              ? 'bg-white/20 text-white'
              : 'text-white/60 hover:text-white'
          }`}
        >
          End Time
          <ArrowIcon field="endTime" />
        </button>
      </div>
    </div>
  );
}
