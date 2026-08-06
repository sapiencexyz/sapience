import {
  TableFilters,
  getDefaultFilterState,
  type TableFilterState,
  type TableFiltersConfig,
} from '~/components/shared/TableFilters';

export type PositionStatus = 'active' | 'won' | 'lost';
export type PositionsFilterState = TableFilterState<PositionStatus>;
export const getDefaultPositionsFilterState =
  getDefaultFilterState<PositionStatus>;

const POSITIONS_CONFIG: TableFiltersConfig<PositionStatus> = {
  statusOptions: [
    { value: 'active', label: 'Active' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
  ],
  valueRange: {
    placeholder: 'Any size',
    min: 0,
    max: 10000,
    step: 10,
    unit: 'USDe',
    formatValue: (v) => (v >= 10000 ? '∞' : v.toLocaleString()),
    parseValue: (v) => (v === '∞' ? 10000 : Number(v.replace(/,/g, ''))),
  },
  dateRange: {
    placeholder: 'Any end date',
    customLabels: [
      { range: [0, 365], label: 'Ends in the future' },
      { range: [-365, 0], label: 'Ended in the past' },
    ],
  },
};

export function PositionsTableFilters(props: {
  filters: PositionsFilterState;
  onFiltersChange: (filters: PositionsFilterState) => void;
  className?: string;
}) {
  return <TableFilters {...props} config={POSITIONS_CONFIG} />;
}

export default PositionsTableFilters;
