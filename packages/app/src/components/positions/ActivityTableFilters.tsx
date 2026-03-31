import {
  TableFilters,
  getDefaultFilterState,
  type TableFilterState,
  type TableFiltersConfig,
} from '~/components/shared/TableFilters';
import {
  StatusFilter,
  type StatusOption,
} from '~/components/shared/StatusFilter';

export type ActivityStatus = 'pending' | 'predictor_won' | 'counterparty_won';
export type ActivityType = 'all' | 'prediction' | 'trade';

export type ActivityFilterState = TableFilterState<ActivityStatus> & {
  activityType: ActivityType;
};

export function getDefaultActivityFilterState(): ActivityFilterState {
  return {
    ...getDefaultFilterState<ActivityStatus>(),
    activityType: 'all',
  };
}

const ACTIVITY_CONFIG: TableFiltersConfig<ActivityStatus> = {
  statusOptions: [
    { value: 'pending', label: 'Pending' },
    { value: 'predictor_won', label: 'Predictor Won' },
    { value: 'counterparty_won', label: 'Counterparty Won' },
  ],
  valueRange: {
    placeholder: 'Any payout',
    min: 0,
    max: 10000,
    step: 10,
    unit: 'USDe',
    formatValue: (v) => (v >= 10000 ? '∞' : v.toLocaleString()),
    parseValue: (v) => (v === '∞' ? 10000 : Number(v.replace(/,/g, ''))),
  },
  dateRange: {
    placeholder: 'Any date',
    customLabels: [
      { range: [0, 365], label: 'Last 365 days' },
      { range: [-365, 0], label: 'Older activity' },
    ],
  },
};

const ACTIVITY_TYPE_OPTIONS: StatusOption<ActivityType>[] = [
  { value: 'all', label: 'All' },
  { value: 'prediction', label: 'Predictions' },
  { value: 'trade', label: 'Trades' },
];

export function ActivityTableFilters(props: {
  filters: ActivityFilterState;
  onFiltersChange: (filters: ActivityFilterState) => void;
  showTypeFilter?: boolean;
  className?: string;
}) {
  const { filters, onFiltersChange, showTypeFilter, className } = props;

  const handleTypeChange = (selected: ActivityType[]) => {
    // Single-select: take the last selected value, default to 'all'
    const value = selected.length > 0 ? selected[selected.length - 1] : 'all';
    onFiltersChange({ ...filters, activityType: value });
  };

  // For the base TableFilters, we pass through without activityType
  const handleBaseChange = (base: TableFilterState<ActivityStatus>) => {
    onFiltersChange({ ...base, activityType: filters.activityType });
  };

  return (
    <div
      className={`grid gap-2 md:gap-4 ${showTypeFilter ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'} ${className ?? ''}`}
    >
      {showTypeFilter && (
        <StatusFilter
          options={ACTIVITY_TYPE_OPTIONS}
          selected={
            filters.activityType === 'all' ? [] : [filters.activityType]
          }
          onChange={handleTypeChange}
          placeholder="All activity"
          allLabel="All activity"
        />
      )}
      <TableFilters
        filters={filters}
        onFiltersChange={handleBaseChange}
        config={ACTIVITY_CONFIG}
        inline
      />
    </div>
  );
}

export default ActivityTableFilters;
