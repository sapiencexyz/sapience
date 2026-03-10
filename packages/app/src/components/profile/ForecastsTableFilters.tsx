import {
  TableFilters,
  getDefaultFilterState,
  type TableFilterState,
  type TableFiltersConfig,
} from '~/components/shared/TableFilters';

export type ResolutionStatus = 'pending' | 'yes' | 'no' | 'nonDecisive';
export type ForecastsFilterState = TableFilterState<ResolutionStatus>;
export const getDefaultForecastsFilterState =
  getDefaultFilterState<ResolutionStatus>;

const FORECASTS_CONFIG: TableFiltersConfig<ResolutionStatus> = {
  searchPlaceholder: 'Search question or comment',
  statusOptions: [
    { value: 'pending', label: 'Pending' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'nonDecisive', label: 'Indecisive' },
  ],
  statusPlaceholder: 'Any resolution',
  statusAllLabel: 'All resolutions',
  valueRange: {
    placeholder: 'Any probability',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    formatValue: (v) => `${v}`,
    parseValue: (v) => Number(v),
  },
  dateRange: {
    placeholder: 'Any date',
    customLabels: [
      { range: [0, 365], label: 'Last 365 days' },
      { range: [-365, 0], label: 'Older forecasts' },
    ],
  },
};

export function ForecastsTableFilters(props: {
  filters: ForecastsFilterState;
  onFiltersChange: (filters: ForecastsFilterState) => void;
  className?: string;
}) {
  return <TableFilters {...props} config={FORECASTS_CONFIG} />;
}

export default ForecastsTableFilters;
