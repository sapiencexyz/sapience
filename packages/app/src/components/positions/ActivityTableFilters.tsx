import {
  TableFilters,
  getDefaultFilterState,
  type TableFilterState,
  type TableFiltersConfig,
} from '~/components/shared/TableFilters';

export type ActivityStatus = 'pending' | 'predictor_won' | 'counterparty_won';
export type ActivityFilterState = TableFilterState<ActivityStatus>;
export const getDefaultActivityFilterState =
  getDefaultFilterState<ActivityStatus>;

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

export function ActivityTableFilters(props: {
  filters: ActivityFilterState;
  onFiltersChange: (filters: ActivityFilterState) => void;
  className?: string;
}) {
  return <TableFilters {...props} config={ACTIVITY_CONFIG} />;
}

export default ActivityTableFilters;
