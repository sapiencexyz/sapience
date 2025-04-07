'use client';

import type { Column, ColumnMeta, RowData, Table } from '@tanstack/react-table';
import { format, isEqual } from 'date-fns';
import { FilterXIcon, ArrowRight, Filter, X, Ellipsis } from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ComponentType,
  ReactElement,
  ElementType as ReactElementType,
} from 'react';
import type { DateRange } from 'react-day-picker';

import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Input } from '~/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Separator } from '~/components/ui/separator';
import Slider from '~/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { useIsMobile } from '~/hooks/use-mobile';
import { take, uniq } from '~/lib/array';
import type {
  ColumnOption,
  ElementType,
  ColumnDataType,
  FilterValue,
  NumberFilterOperator,
} from '~/lib/filters';
import {
  createNumberRange,
  dateFilterDetails,
  determineNewOperator,
  filterTypeOperatorDetails,
  getColumn,
  getColumnMeta,
  isColumnOptionArray,
  multiOptionFilterDetails,
  numberFilterDetails,
  optionFilterDetails,
  textFilterDetails,
} from '~/lib/filters';
import { cn } from '~/lib/utils';

// Constants for commonly used values
const SIZE_4_CLASS = 'size-4';
const OPACITY_CLASS =
  'opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100';
const COUNT_CLASS = 'ml-0.5 tabular-nums tracking-tight text-muted-foreground';
const TEXT_XS_CLASS = 'text-xs';
const MAX_H_FIT_CLASS = 'max-h-fit';
const GROUP_FLEX_CLASS = 'group flex items-center justify-between gap-1.5';
const FLEX_ITEMS_CENTER_GAP_1_5 = 'flex items-center gap-1.5';
const POPOVER_CONTENT_ORIGIN =
  'origin-(--radix-popover-content-transform-origin)';
const SLASHED_ZERO_CLASS = 'slashed-zero';
const H_7_CLASS = 'h-7';
const PLACEHOLDER_SEARCH = 'Search...';
const NO_RESULTS_MESSAGE = 'No results.';
const INVALID_FILTER_CONFIG_ERROR = (id: string) =>
  `[data-table-filter] [${id}] Either provide static options, a transformOptionFn, or ensure the column data conforms to ColumnOption type`;
const TABULAR_NUMS_TRACKING_TIGHT = 'tabular-nums tracking-tight';
const BUTTON_GHOST_VARIANT = 'ghost';
const COMMAND_GROUP_HEADING_OPERATORS = 'Operators';
const COUNT_DISPLAY_LIMIT = '100+';
const NUMBER_FILTER_TYPE_RANGE = 'range';
const NUMBER_FILTER_TYPE_SINGLE = 'single';
const CAPPED_MAX_DISPLAY_SUFFIX = '+';
const CAPPED_MAX_DISPLAY = (max: number) =>
  `${max}${CAPPED_MAX_DISPLAY_SUFFIX}`;
const FONT_MEDIUM_CLASS = 'font-medium';
const MULTI_OPTION_TYPE = 'multiOption';
const MULTI_OPTION_DEFAULT_OPERATOR = 'include';

// Create a PopoverAnchor component since it's missing from the import
const PopoverAnchor = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => <div className={className}>{children}</div>;

// Type definition for icon components with more specific types
type IconType =
  | ComponentType<React.SVGProps<SVGSVGElement>>
  | ReactElement
  | ReactElementType;

// Type guard for safe icon rendering
const renderIcon = (icon: IconType, props: Record<string, unknown> = {}) => {
  if (!icon) return null;
  if (isValidElement(icon)) return cloneElement(icon, props);

  try {
    // Attempt to render as a component
    const IconComponent = icon as ReactElementType;
    return <IconComponent {...props} />;
  } catch (e) {
    // Fallback in case rendering fails
    console.error('Failed to render icon:', e);
    return null;
  }
};

export function DataTableFilter<TData>({ table }: { table: Table<TData> }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex gap-1">
          <TableFilter table={table} />
          <TableFilterActions table={table} />
        </div>
        <DataTableFilterMobileContainer>
          <PropertyFilterList table={table} />
        </DataTableFilterMobileContainer>
      </div>
    );
  }

  return (
    <div className="flex w-full items-start justify-between gap-2">
      <div className="flex md:flex-wrap gap-2 w-full flex-1">
        <TableFilter table={table} />
        <PropertyFilterList table={table} />
      </div>
      <TableFilterActions table={table} />
    </div>
  );
}

export function DataTableFilterMobileContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftBlur, setShowLeftBlur] = useState(false);
  const [showRightBlur, setShowRightBlur] = useState(true);

  // Check if there's content to scroll and update blur states
  const checkScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;

      // Show left blur if scrolled to the right
      setShowLeftBlur(scrollLeft > 0);

      // Show right blur if there's more content to scroll to the right
      // Add a small buffer (1px) to account for rounding errors
      setShowRightBlur(scrollLeft + clientWidth < scrollWidth - 1);
    }
  }, []);

  // Set up ResizeObserver to monitor container size
  useEffect(() => {
    const currentRef = scrollContainerRef.current;
    if (currentRef) {
      const resizeObserver = new ResizeObserver(() => {
        checkScroll();
      });
      resizeObserver.observe(currentRef);
      return () => {
        resizeObserver.disconnect();
      };
    }
    return undefined;
  }, [checkScroll]);

  // Update blur states when children change
  useEffect(() => {
    checkScroll();
  }, [children, checkScroll]);

  return (
    <div className="relative w-full overflow-x-hidden">
      {/* Left blur effect */}
      {showLeftBlur && (
        <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-background to-transparent animate-in fade-in-0" />
      )}

      {/* Scrollable container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-2 overflow-x-scroll no-scrollbar"
        onScroll={checkScroll}
      >
        {children}
      </div>

      {/* Right blur effect */}
      {showRightBlur && (
        <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-background to-transparent animate-in fade-in-0 " />
      )}
    </div>
  );
}

export function TableFilterActions<TData>({ table }: { table: Table<TData> }) {
  const hasFilters = table.getState().columnFilters.length > 0;

  const clearFilters = useCallback(() => {
    table.setColumnFilters([]);
    table.setGlobalFilter('');
  }, [table]);

  return (
    <Button
      className={cn(H_7_CLASS, '!px-2', !hasFilters && 'hidden')}
      variant="destructive"
      onClick={clearFilters}
    >
      <FilterXIcon />
      <span className="hidden md:block">Clear</span>
    </Button>
  );
}

export function TableFilter<TData>({ table }: { table: Table<TData> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [property, setProperty] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const column = useMemo(
    () => (property ? getColumn(table, property) : undefined),
    [property, table]
  );
  const columnMeta = useMemo(
    () => (property ? getColumnMeta(table, property) : undefined),
    [property, table]
  );

  const properties = useMemo(
    () => table.getAllColumns().filter((col) => col.getCanFilter()),
    [table]
  );

  const hasFilters = table.getState().columnFilters.length > 0;

  useEffect(() => {
    if (property && inputRef.current) {
      inputRef.current.focus();
      setValue('');
    }
  }, [property]);

  const handleOpenChange = useCallback((newOpenState: boolean) => {
    setOpen(newOpenState);
    if (!newOpenState) {
      setTimeout(() => setProperty(undefined), 100);
    }
  }, []);

  const handleValueChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, []);

  useEffect(() => {
    if (!open) setTimeout(() => setValue(''), 150);
  }, [open]);

  const content = useMemo(() => {
    if (property && column && columnMeta) {
      return (
        <PropertyFilterValueMenu
          id={property}
          column={column}
          columnMeta={columnMeta}
          table={table}
        />
      );
    }

    return (
      <Command loop>
        <CommandInput
          value={value}
          onValueChange={handleValueChange}
          ref={inputRef}
          placeholder={PLACEHOLDER_SEARCH}
        />
        <CommandEmpty>{NO_RESULTS_MESSAGE}</CommandEmpty>
        <CommandList className={MAX_H_FIT_CLASS}>
          <CommandGroup>
            {properties.map((propColumn) => (
              <TableFilterMenuItem
                key={propColumn.id}
                column={propColumn}
                setProperty={setProperty}
              />
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    );
  }, [
    property,
    column,
    columnMeta,
    table,
    value,
    handleValueChange,
    properties,
  ]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(H_7_CLASS, hasFilters && 'w-fit !px-2')}
        >
          <Filter className={SIZE_4_CLASS} />
          {!hasFilters && <span>Filter</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className={cn('w-fit p-0', POPOVER_CONTENT_ORIGIN)}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

export function TableFilterMenuItem<TData>({
  column,
  setProperty,
}: {
  column: Column<TData>;
  setProperty: (value: string) => void;
}) {
  const Icon = column.columnDef.meta?.icon;

  const handleSelect = useCallback(
    () => setProperty(column.id),
    [column.id, setProperty]
  );

  return (
    <CommandItem onSelect={handleSelect} className="group">
      <div className="flex w-full items-center justify-between">
        <div className={FLEX_ITEMS_CENTER_GAP_1_5}>
          {Icon &&
            renderIcon(Icon, { strokeWidth: 2.25, className: SIZE_4_CLASS })}
          <span>{column.columnDef.meta?.displayName}</span>
        </div>
        <ArrowRight
          className={`${SIZE_4_CLASS} opacity-0 group-aria-selected:opacity-100`}
        />
      </div>
    </CommandItem>
  );
}

export function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounce?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  const [inputValue, setInputValue] = useState(initialValue);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(inputValue);
    }, debounce);

    return () => clearTimeout(timeout);
  }, [inputValue, onChange, debounce]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  return <Input {...props} value={inputValue} onChange={handleChange} />;
}

export function PropertyFilterList<TData>({ table }: { table: Table<TData> }) {
  const filters = table.getState().columnFilters;

  return (
    <>
      {filters.map((filter) => {
        const { id, value } = filter;

        const column = getColumn(table, id);
        const meta = getColumnMeta(table, id);

        // Skip if no filter value
        if (!value) return null;

        // Ensure meta exists before proceeding
        if (!meta) return null;

        // Narrow the type based on meta.type and cast filter accordingly
        switch (meta.type) {
          case 'text':
            return RenderFilter<TData, 'text'>(
              filter as { id: string; value: FilterValue<'text', TData> },
              column,
              meta as ColumnMeta<TData, unknown> & { type: 'text' },
              table
            );
          case 'number':
            return RenderFilter<TData, 'number'>(
              filter as { id: string; value: FilterValue<'number', TData> },
              column,
              meta as ColumnMeta<TData, unknown> & { type: 'number' },
              table
            );
          case 'date':
            return RenderFilter<TData, 'date'>(
              filter as { id: string; value: FilterValue<'date', TData> },
              column,
              meta as ColumnMeta<TData, unknown> & { type: 'date' },
              table
            );
          case 'option':
            return RenderFilter<TData, 'option'>(
              filter as { id: string; value: FilterValue<'option', TData> },
              column,
              meta as ColumnMeta<TData, unknown> & { type: 'option' },
              table
            );
          case 'multiOption':
            return RenderFilter<TData, 'multiOption'>(
              filter as {
                id: string;
                value: FilterValue<'multiOption', TData>;
              },
              column,
              meta as ColumnMeta<TData, unknown> & {
                type: 'multiOption';
              },
              table
            );
          default:
            return null; // Handle unknown types gracefully
        }
      })}
    </>
  );
}

// Generic render function for a filter with type-safe value
function RenderFilter<TData, T extends ColumnDataType>(
  filter: { id: string; value: FilterValue<T, TData> },
  column: Column<TData, unknown>,
  meta: ColumnMeta<TData, unknown> & { type: T },
  table: Table<TData>
) {
  const { value, id } = filter;

  const handleRemoveFilter = useCallback(() => {
    table.getColumn(id)?.setFilterValue(undefined);
  }, [table, id]);

  return (
    <div
      key={`filter-${id}`}
      className={cn(
        'flex h-7 items-center rounded-2xl border border-border bg-background shadow-xs',
        TEXT_XS_CLASS
      )}
    >
      <PropertyFilterSubject meta={meta} />
      <Separator orientation="vertical" />
      <PropertyFilterOperatorController
        column={column}
        columnMeta={meta}
        filter={value} // Typed as FilterValue<T>
      />
      <Separator orientation="vertical" />
      <PropertyFilterValueController
        id={id}
        column={column}
        columnMeta={meta}
        table={table}
      />
      <Separator orientation="vertical" />
      <Button
        variant={BUTTON_GHOST_VARIANT}
        className={cn('rounded-none rounded-r-2xl w-7 h-full', TEXT_XS_CLASS)}
        onClick={handleRemoveFilter}
      >
        <X className="size-4 -translate-x-0.5" />
      </Button>
    </div>
  );
}

/** **** Property Filter Subject ***** */

export function PropertyFilterSubject<TData>({
  meta,
}: {
  // eslint-disable-next-line react/no-unused-prop-types
  meta: ColumnMeta<TData, string>;
}) {
  const hasIcon = !!meta?.icon;
  return (
    <span className="flex select-none items-center gap-1 whitespace-nowrap px-2 font-medium">
      {hasIcon &&
        renderIcon(meta.icon, { className: 'size-4 stroke-[2.25px]' })}
      <span>{meta.displayName}</span>
    </span>
  );
}

/** **** Property Filter Operator ***** */

// Renders the filter operator display and menu for a given column filter
// The filter operator display is the label and icon for the filter operator
// The filter operator menu is the dropdown menu for the filter operator
export function PropertyFilterOperatorController<
  TData,
  T extends ColumnDataType,
>({
  column,
  columnMeta,
  filter,
}: {
  column: Column<TData, unknown>;
  columnMeta: ColumnMeta<TData, unknown>;
  filter: FilterValue<T, TData>;
}) {
  const [open, setOpen] = useState<boolean>(false);

  const close = useCallback(() => setOpen(false), []);
  const handleOpenChange = useCallback(
    (newOpenState: boolean) => setOpen(newOpenState),
    []
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={BUTTON_GHOST_VARIANT}
          className={cn(
            'm-0 h-full w-fit whitespace-nowrap rounded-none p-0 px-2',
            TEXT_XS_CLASS
          )}
        >
          <PropertyFilterOperatorDisplay
            filter={filter}
            filterType={columnMeta.type}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className={cn('w-fit p-0', POPOVER_CONTENT_ORIGIN)}
      >
        <Command loop>
          <CommandInput placeholder={PLACEHOLDER_SEARCH} />
          <CommandEmpty>{NO_RESULTS_MESSAGE}</CommandEmpty>
          <CommandList className={MAX_H_FIT_CLASS}>
            <PropertyFilterOperatorMenu
              column={column}
              closeController={close}
            />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function PropertyFilterOperatorDisplay<TData, T extends ColumnDataType>({
  filter,
  filterType,
}: {
  filter: FilterValue<T, TData>;
  filterType: T;
}) {
  const details = filterTypeOperatorDetails[filterType][filter.operator];

  return <span>{details.label}</span>;
}

// Re-introduce PropertyFilterOperatorMenu switch
export function PropertyFilterOperatorMenu<TData>({
  column,
  closeController,
}: PropertyFilterOperatorMenuProps<TData>) {
  const { meta } = column.columnDef;

  if (!meta?.type) return null;

  switch (meta.type) {
    case 'option':
      return (
        <PropertyFilterOptionOperatorMenu
          column={column}
          closeController={closeController}
        />
      );
    case 'multiOption':
      return (
        <PropertyFilterMultiOptionOperatorMenu
          column={column}
          closeController={closeController}
        />
      );
    case 'date':
      return (
        <PropertyFilterDateOperatorMenu
          column={column}
          closeController={closeController}
        />
      );
    case 'text':
      return (
        <PropertyFilterTextOperatorMenu
          column={column}
          closeController={closeController}
        />
      );
    case 'number':
      return (
        <PropertyFilterNumberOperatorMenu
          column={column}
          closeController={closeController}
        />
      );
    default:
      return null;
  }
}

interface PropertyFilterOperatorMenuProps<TData> {
  column: Column<TData, unknown>;
  closeController: () => void;
}

// Helper to render a command item for operator selection
const renderOperatorCommandItem = (
  r: { value: string; label: string },
  changeOperator: (value: string) => void
) => (
  <CommandItem
    onSelect={() => changeOperator(r.value)}
    value={r.value}
    key={r.value}
  >
    {r.label}
  </CommandItem>
);

// Generic filter operator menu change handler
function useCreateOperatorChangeHandler<TData, T extends ColumnDataType>(
  column: Column<TData>,
  closeController: () => void
) {
  return useCallback(
    (value: string) => {
      column.setFilterValue((old: FilterValue<T, TData> | undefined) => {
        // Ensure the operator is valid for the type T
        // This might require more specific type handling or validation
        const typedOperator = value as FilterValue<T, TData>['operator'];
        return {
          ...(old as FilterValue<T, TData>),
          operator: typedOperator,
        };
      });
      closeController();
    },
    [column, closeController]
  );
}

// Generic component to render operator menus
function GenericPropertyFilterOperatorMenu<TData, T extends ColumnDataType>({
  column,
  closeController,
  filterDetailsMap,
}: {
  column: Column<TData>;
  closeController: () => void;
  filterDetailsMap: Record<
    string,
    { target: string; value: string; label: string }
  >;
}) {
  const filter = column.getFilterValue() as FilterValue<T, TData>;
  const changeOperator = useCreateOperatorChangeHandler<TData, T>(
    column,
    closeController
  );

  const filterDetails = filterDetailsMap[filter.operator];
  // Handle cases where filter or operator might not exist yet
  if (!filterDetails) return null;

  const relatedFilters = Object.values(filterDetailsMap).filter(
    (o) => o.target === filterDetails.target
  );

  return (
    <CommandGroup heading={COMMAND_GROUP_HEADING_OPERATORS}>
      {relatedFilters.map((r) => renderOperatorCommandItem(r, changeOperator))}
    </CommandGroup>
  );
}

function PropertyFilterOptionOperatorMenu<TData>({
  column,
  closeController,
}: PropertyFilterOperatorMenuProps<TData>) {
  return (
    <GenericPropertyFilterOperatorMenu<TData, 'option'>
      column={column}
      closeController={closeController}
      filterDetailsMap={optionFilterDetails}
    />
  );
}

function PropertyFilterMultiOptionOperatorMenu<TData>({
  column,
  closeController,
}: PropertyFilterOperatorMenuProps<TData>) {
  return (
    <GenericPropertyFilterOperatorMenu<TData, 'multiOption'>
      column={column}
      closeController={closeController}
      filterDetailsMap={multiOptionFilterDetails}
    />
  );
}

function PropertyFilterDateOperatorMenu<TData>({
  column,
  closeController,
}: PropertyFilterOperatorMenuProps<TData>) {
  return (
    <GenericPropertyFilterOperatorMenu<TData, 'date'>
      column={column}
      closeController={closeController}
      filterDetailsMap={dateFilterDetails}
    />
  );
}

export function PropertyFilterTextOperatorMenu<TData>({
  column,
  closeController,
}: PropertyFilterOperatorMenuProps<TData>) {
  return (
    <GenericPropertyFilterOperatorMenu<TData, 'text'>
      column={column}
      closeController={closeController}
      filterDetailsMap={textFilterDetails}
    />
  );
}

function PropertyFilterNumberOperatorMenu<TData>({
  column,
  closeController,
}: PropertyFilterOperatorMenuProps<TData>) {
  const relatedFilters = Object.values(numberFilterDetails);
  const relatedFilterOperators = relatedFilters.map((r) => r.value);

  const changeOperator = useCallback(
    (value: string) => {
      // Ensure value is a valid NumberFilterOperator
      const operatorValue = value as NumberFilterOperator;
      if (!relatedFilterOperators.includes(operatorValue)) {
        console.error(`Invalid number filter operator: ${value}`);
        return;
      }

      column.setFilterValue((old: FilterValue<'number', TData> | undefined) => {
        // Ensure old exists and has values
        if (!old || !old.values) {
          return {
            operator: operatorValue,
            values: createNumberRange([]), // Default or initial range
          };
        }

        // Clear out the second value when switching to single-input operators
        const { target } = numberFilterDetails[operatorValue];
        const newValues =
          target === 'single'
            ? [old.values[0] ?? 0] // Provide a default if undefined
            : createNumberRange(old.values);

        return { operator: operatorValue, values: newValues };
      });
      closeController();
    },
    [column, closeController, relatedFilterOperators] // Add dependency
  );

  return (
    <div>
      <CommandGroup heading={COMMAND_GROUP_HEADING_OPERATORS}>
        {/* Use specific handler for number, avoid generic renderOperatorCommandItem due to type mismatch */}
        {relatedFilters.map((r) => (
          <CommandItem
            onSelect={() => changeOperator(r.value)}
            value={r.value}
            key={r.value}
          >
            {r.label}
          </CommandItem>
        ))}
      </CommandGroup>
    </div>
  );
}

/** **** Property Filter Value ***** */

export function PropertyFilterValueController<TData, TValue>({
  id,
  column,
  columnMeta,
  table,
}: {
  id: string;
  column: Column<TData>;
  columnMeta: ColumnMeta<TData, TValue>;
  table: Table<TData>;
}) {
  return (
    <Popover>
      <PopoverAnchor className="h-full" />
      <PopoverTrigger asChild>
        <Button
          variant={BUTTON_GHOST_VARIANT}
          className={cn(
            'm-0 h-full w-fit whitespace-nowrap rounded-none p-0 px-2',
            TEXT_XS_CLASS
          )}
        >
          <PropertyFilterValueDisplay
            id={id}
            column={column}
            columnMeta={columnMeta}
            table={table}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className={cn('w-fit p-0', POPOVER_CONTENT_ORIGIN)}
      >
        <PropertyFilterValueMenu
          id={id}
          column={column}
          columnMeta={columnMeta}
          table={table}
        />
      </PopoverContent>
    </Popover>
  );
}

interface PropertyFilterValueDisplayProps<TData, TValue> {
  id: string;
  column: Column<TData>;
  columnMeta: ColumnMeta<TData, TValue>;
  table: Table<TData>;
}

// Re-introduce PropertyFilterValueDisplay switch
export function PropertyFilterValueDisplay<TData, TValue>({
  id,
  column,
  columnMeta,
  table,
}: PropertyFilterValueDisplayProps<TData, TValue>) {
  if (!columnMeta?.type) return null;

  switch (columnMeta.type) {
    case 'option':
      return (
        <PropertyFilterOptionValueDisplay
          id={id}
          column={column}
          columnMeta={columnMeta}
          table={table}
        />
      );
    case 'multiOption':
      return (
        <PropertyFilterMultiOptionValueDisplay
          id={id}
          column={column}
          columnMeta={columnMeta}
          table={table}
        />
      );
    case 'date':
      return <PropertyFilterDateValueDisplay column={column} />;
    case 'text':
      return <PropertyFilterTextValueDisplay column={column} />;
    case 'number':
      return (
        <PropertyFilterNumberValueDisplay
          column={column}
          columnMeta={columnMeta}
        />
      );
    default:
      return null;
  }
}

// Helper function to get options for Option and MultiOption types
const getOptions = <TData, TValue>(
  id: string,
  columnMeta: ColumnMeta<TData, TValue>,
  table: Table<TData>
): ColumnOption[] => {
  const columnVals = table
    .getCoreRowModel()
    .rows.flatMap((r) => r.getValue<TValue>(id))
    .filter((v): v is NonNullable<TValue> => v !== undefined && v !== null);
  const uniqueVals = uniq(columnVals);

  if (columnMeta.options) {
    return columnMeta.options;
  }

  if (columnMeta.transformOptionFn) {
    const { transformOptionFn } = columnMeta;
    return uniqueVals.map((v) =>
      transformOptionFn(v as ElementType<NonNullable<TValue>>)
    );
  }

  if (isColumnOptionArray(uniqueVals)) {
    return uniqueVals;
  }

  throw new Error(INVALID_FILTER_CONFIG_ERROR(id));
};

// ... (PropertyFilterOptionValueDisplay, PropertyFilterMultiOptionValueDisplay, formatDateRange, PropertyFilterDateValueDisplay, PropertyFilterTextValueDisplay, PropertyFilterNumberValueDisplay remain the same)
export function PropertyFilterOptionValueDisplay<TData, TValue>({
  id,
  column,
  columnMeta,
  table,
}: PropertyFilterValueDisplayProps<TData, TValue>) {
  const options = useMemo(
    () => getOptions(id, columnMeta, table),
    [id, columnMeta, table]
  );
  const filter = column.getFilterValue() as FilterValue<'option', TData>;
  const selected = useMemo(
    () => options.filter((o) => filter?.values.includes(o.value)),
    [options, filter?.values]
  );

  // We display the selected options based on how many are selected
  //
  // If there is only one option selected, we display its icon and label
  //
  // If there are multiple options selected, we display:
  // 1) up to 3 icons of the selected options
  // 2) the number of selected options
  if (selected.length === 1) {
    const { label, icon } = selected[0];
    const hasIcon = !!icon;
    return (
      <span className="inline-flex items-center gap-1">
        {hasIcon && renderIcon(icon, { className: 'size-4 text-primary' })}
        <span>{label}</span>
      </span>
    );
  }
  const name = columnMeta.displayName.toLowerCase();
  const pluralName = name.endsWith('s') ? `${name}es` : `${name}s`;

  const hasOptionIcons = !options?.some((o) => !o.icon);

  return (
    <div className="inline-flex items-center gap-0.5">
      {hasOptionIcons &&
        take(selected, 3).map(({ value, icon }) =>
          icon
            ? renderIcon(icon, { key: value, className: SIZE_4_CLASS })
            : null
        )}
      <span className={cn(hasOptionIcons && 'ml-1.5')}>
        {selected.length} {pluralName}
      </span>
    </div>
  );
}

export function PropertyFilterMultiOptionValueDisplay<TData, TValue>({
  id,
  column,
  columnMeta,
  table,
}: PropertyFilterValueDisplayProps<TData, TValue>) {
  const options = useMemo(
    () => getOptions(id, columnMeta, table),
    [id, columnMeta, table]
  );
  const filter = column.getFilterValue() as
    | FilterValue<'multiOption', TData>
    | undefined;
  const selected = useMemo(
    () => options.filter((o) => filter?.values[0]?.includes(o.value)),
    [options, filter?.values]
  );

  if (selected.length === 1) {
    const { label, icon } = selected[0];
    const hasIcon = !!icon;
    return (
      <span className={FLEX_ITEMS_CENTER_GAP_1_5}>
        {hasIcon && renderIcon(icon, { className: 'size-4 text-primary' })}
        <span>{label}</span>
      </span>
    );
  }

  const name = columnMeta.displayName.toLowerCase();
  const hasOptionIcons = !options.some((o) => !o.icon);

  return (
    <div className={FLEX_ITEMS_CENTER_GAP_1_5}>
      {hasOptionIcons && (
        <div key="icons" className="inline-flex items-center gap-0.5">
          {take(selected, 3).map(({ value, icon }) =>
            icon
              ? renderIcon(icon, { key: value, className: SIZE_4_CLASS })
              : null
          )}
        </div>
      )}
      <span>
        {selected.length} {name}
      </span>
    </div>
  );
}

function formatDateRange(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth && sameYear) {
    return `${format(start, 'MMM d')} - ${format(end, 'd, yyyy')}`;
  }

  if (sameYear) {
    // eslint-disable-next-line sonarjs/no-duplicate-string
    return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
  }

  return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PropertyFilterDateValueDisplay<TData>({
  column,
}: {
  column: Column<TData>;
}) {
  const filter = column.getFilterValue()
    ? (column.getFilterValue() as FilterValue<'date', TData>)
    : undefined;

  if (!filter) return null;
  if (filter.values.length === 0) return <Ellipsis className={SIZE_4_CLASS} />;
  if (filter.values.length === 1) {
    const value = filter.values[0];
    const formattedDateStr = format(value, 'MMM d, yyyy');
    return <span>{formattedDateStr}</span>;
  }

  const formattedRangeStr = formatDateRange(filter.values[0], filter.values[1]);
  return <span>{formattedRangeStr}</span>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PropertyFilterTextValueDisplay<TData, TValue>({
  column,
}: {
  column: Column<TData>;
}) {
  const filter = column.getFilterValue()
    ? (column.getFilterValue() as FilterValue<'text', TData>)
    : undefined;

  if (!filter) return null;
  if (filter.values.length === 0 || filter.values[0].trim() === '')
    return <Ellipsis className={SIZE_4_CLASS} />;

  const value = filter.values[0];

  return <span>{value}</span>;
}

export function PropertyFilterNumberValueDisplay<TData, TValue>({
  column,
  columnMeta,
}: {
  column: Column<TData>;
  columnMeta: ColumnMeta<TData, TValue>;
}) {
  const maxFromMeta = columnMeta.max;
  const cappedMax = useMemo(
    () => maxFromMeta ?? Number.MAX_SAFE_INTEGER, // Use MAX_SAFE_INTEGER as default
    [maxFromMeta]
  );
  const filter = column.getFilterValue()
    ? (column.getFilterValue() as FilterValue<'number', TData>)
    : undefined;

  if (!filter) return null;

  const isRangeOperator =
    // eslint-disable-next-line sonarjs/no-duplicate-string
    filter.operator === 'is between' || filter.operator === 'is not between';

  if (isRangeOperator) {
    const minValue = filter.values[0] ?? 0; // Default to 0 if undefined
    const maxValue = filter.values[1] ?? Number.POSITIVE_INFINITY; // Default to +Infinity if undefined for range max
    let displayMaxValue: string | number;

    // Handle max value display
    if (maxValue >= cappedMax) {
      displayMaxValue = CAPPED_MAX_DISPLAY(cappedMax);
    } else {
      displayMaxValue = maxValue;
    }

    return (
      <span className={TABULAR_NUMS_TRACKING_TIGHT}>
        {minValue} and {displayMaxValue}
      </span>
    );
  }

  // Handle single value operators
  if (
    !filter.values ||
    filter.values.length === 0 ||
    filter.values[0] === undefined ||
    filter.values[0] === null
  ) {
    // Check if it's a single-value operator expecting a value, show ellipsis if empty
    const operatorDetails = numberFilterDetails[filter.operator];
    if (operatorDetails && operatorDetails.target === 'single') {
      return <Ellipsis className={SIZE_4_CLASS} />;
    }
    // Otherwise, might be an unset filter or unexpected state
    return null;
  }

  const value = filter.values[0]; // Already defaulted/checked above implicitly
  return <span className={TABULAR_NUMS_TRACKING_TIGHT}>{value}</span>;
}

// ... (PropertyFilterValueMenu remains the same, calls specific menus)
export function PropertyFilterValueMenu<TData extends RowData, TValue>({
  id,
  column,
  columnMeta,
  table,
}: {
  id: string;
  column: Column<TData>;
  columnMeta: ColumnMeta<TData, TValue>;
  table: Table<TData>;
}) {
  switch (columnMeta.type) {
    case 'option':
      return (
        <PropertyFilterOptionValueMenu
          id={id}
          column={column}
          columnMeta={columnMeta}
          table={table}
        />
      );
    case 'multiOption':
      return (
        <PropertyFilterMultiOptionValueMenu
          id={id}
          column={column}
          columnMeta={columnMeta}
          table={table}
        />
      );
    case 'date':
      return <PropertyFilterDateValueMenu column={column} />;
    case 'text':
      return <PropertyFilterTextValueMenu column={column} />;
    case 'number':
      return (
        <PropertyFilterNumberValueMenu
          column={column}
          columnMeta={columnMeta}
        />
      );
    default:
      return null;
  }
}

// Keep original props for Option/MultiOption
interface ProperFilterValueMenuProps<TData extends RowData, TValue> {
  id: string;
  column: Column<TData>;
  columnMeta: ColumnMeta<TData, TValue>;
  table: Table<TData>;
}

// Specific props for Date menu
interface PropertyFilterDateValueMenuProps<TData extends RowData> {
  column: Column<TData>;
}

// Specific props for Text menu
interface PropertyFilterTextValueMenuProps<TData extends RowData> {
  column: Column<TData>;
}

// Specific props for Number menu
interface PropertyFilterNumberValueMenuProps<TData extends RowData, TValue> {
  column: Column<TData>;
  columnMeta: ColumnMeta<TData, TValue>;
}

// Helper function to get options count
const getOptionsCount = <TData, TValue>(
  id: string,
  columnMeta: ColumnMeta<TData, TValue>,
  table: Table<TData>
): Record<ColumnOption['value'], number> => {
  const columnVals = table
    .getCoreRowModel()
    .rows.flatMap((r) => r.getValue<TValue>(id))
    .filter((v): v is NonNullable<TValue> => v !== undefined && v !== null);

  return columnVals.reduce(
    (acc, curr) => {
      let value: string;
      if (columnMeta.transformOptionFn) {
        ({ value } = columnMeta.transformOptionFn(
          curr as ElementType<NonNullable<TValue>>
        ));
      } else if (typeof curr === 'string') {
        value = curr;
      } else if (
        typeof curr === 'object' &&
        curr !== null &&
        'value' in curr &&
        typeof curr.value === 'string'
      ) {
        value = curr.value;
      } else {
        // Skip if the value cannot be determined
        return acc;
      }

      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<ColumnOption['value'], number>
  );
};

// Common Component for Option and MultiOption Value Menu Items
const OptionMenuItem = ({
  option,
  checked,
  count,
  onSelect,
}: {
  option: ColumnOption;
  checked: boolean;
  count: number;
  onSelect: () => void;
}) => (
  <CommandItem
    key={option.value}
    onSelect={onSelect}
    className={GROUP_FLEX_CLASS}
  >
    <div className={FLEX_ITEMS_CENTER_GAP_1_5}>
      <Checkbox checked={checked} className={OPACITY_CLASS} />
      {option.icon &&
        renderIcon(option.icon, {
          className: `${SIZE_4_CLASS} text-primary`,
        })}
      <span>
        {option.label}
        <sup className={cn(COUNT_CLASS, count === 0 && SLASHED_ZERO_CLASS)}>
          {count < 100 ? count : COUNT_DISPLAY_LIMIT}
        </sup>
      </span>
    </div>
  </CommandItem>
);

// Remove TData from signature and update related types
export function PropertyFilterOptionValueMenu<TValue>({
  id,
  column,
  columnMeta,
  table,
}: ProperFilterValueMenuProps<any, TValue>) {
  const options = useMemo(
    () => getOptions(id, columnMeta, table),
    [id, columnMeta, table]
  );
  const filter = column.getFilterValue() as FilterValue<'option', any>;
  const optionsCount = useMemo(
    () => getOptionsCount(id, columnMeta, table),
    [id, columnMeta, table]
  );

  const handleOptionSelect = useCallback(
    (value: string, isChecked: boolean) => {
      column?.setFilterValue((old: FilterValue<'option', any> | undefined) => {
        const { meta } = column.columnDef;
        const currentValues = old?.values ?? [];

        if (isChecked) {
          const newValues = [...currentValues, value];
          const operator = newValues.length > 1 ? 'is any of' : 'is';
          return { operator, values: newValues, columnMeta: meta };
        }

        const newValues = currentValues.filter((v) => v !== value);
        if (newValues.length === 0) return undefined;
        const operator = newValues.length > 1 ? 'is any of' : 'is';
        return { operator, values: newValues, columnMeta: meta };
      });
    },
    [column]
  );

  return (
    <Command loop>
      <CommandInput autoFocus placeholder={PLACEHOLDER_SEARCH} />
      <CommandEmpty>{NO_RESULTS_MESSAGE}</CommandEmpty>
      <CommandList className={MAX_H_FIT_CLASS}>
        <CommandGroup>
          {options.map((option) => {
            const checked = Boolean(filter?.values.includes(option.value));
            const count = optionsCount[option.value] ?? 0;
            const onSelectHandler = () => {
              handleOptionSelect(option.value, !checked);
            };

            return (
              <OptionMenuItem
                key={option.value}
                option={option}
                checked={checked}
                count={count}
                onSelect={onSelectHandler}
              />
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function PropertyFilterMultiOptionValueMenu<
  TData extends RowData,
  TValue,
>({
  id,
  column,
  columnMeta,
  table,
}: ProperFilterValueMenuProps<TData, TValue>) {
  const filter = column.getFilterValue() as
    | FilterValue<'multiOption', TData>
    | undefined;
  const options = useMemo(
    () => getOptions(id, columnMeta, table),
    [id, columnMeta, table]
  );
  const optionsCount = useMemo(
    () => getOptionsCount(id, columnMeta, table),
    [id, columnMeta, table]
  );

  const handleOptionSelect = useCallback(
    (value: string, isChecked: boolean) => {
      column.setFilterValue(
        (old: FilterValue<'multiOption', TData> | undefined) => {
          const { meta } = column.columnDef;
          const currentValues = old?.values[0] ?? [];
          let newValues: string[][];
          let operator: FilterValue<'multiOption', TData>['operator'];

          if (isChecked) {
            newValues = [uniq([...currentValues, value])];
            operator = determineNewOperator(
              MULTI_OPTION_TYPE,
              old?.values ?? [],
              newValues,
              old?.operator ?? MULTI_OPTION_DEFAULT_OPERATOR
            );
          } else {
            const updatedValues = currentValues.filter((v) => v !== value);
            if (updatedValues.length === 0) return undefined; // Clear filter if no options left
            newValues = [updatedValues];
            operator = determineNewOperator(
              MULTI_OPTION_TYPE,
              old?.values ?? [],
              newValues,
              old?.operator ?? MULTI_OPTION_DEFAULT_OPERATOR
            );
          }

          return { operator, values: newValues, columnMeta: meta };
        }
      );
    },
    [column]
  );

  return (
    <Command loop>
      <CommandInput autoFocus placeholder={PLACEHOLDER_SEARCH} />
      <CommandEmpty>{NO_RESULTS_MESSAGE}</CommandEmpty>
      <CommandList>
        <CommandGroup>
          {options.map((option) => {
            const checked = Boolean(filter?.values[0]?.includes(option.value));
            const count = optionsCount[option.value] ?? 0;
            const onSelectHandler = () => {
              handleOptionSelect(option.value, !checked);
            };

            return (
              <OptionMenuItem
                key={option.value}
                option={option}
                checked={checked}
                count={count}
                onSelect={onSelectHandler}
              />
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function PropertyFilterDateValueMenu<TData extends RowData>({
  column,
}: PropertyFilterDateValueMenuProps<TData>) {
  const filter = column.getFilterValue() as
    | FilterValue<'date', TData>
    | undefined;

  const initialDateRange = useMemo(() => {
    return {
      from: filter?.values[0] ?? new Date(),
      to: filter?.values[1] ?? undefined,
    };
  }, [filter?.values]);

  const [date, setDate] = useState<DateRange | undefined>(initialDateRange);

  const changeDateRange = useCallback(
    (value: DateRange | undefined) => {
      const start = value?.from;
      const end =
        start && value?.to && !isEqual(start, value.to) ? value.to : undefined;

      setDate({ from: start, to: end });

      let newValues: Date[] = [];
      if (start) {
        if (end) {
          newValues = [start, end];
        } else {
          newValues = [start];
        }
      }

      column.setFilterValue((old: FilterValue<'date', TData> | undefined) => {
        const { meta } = column.columnDef;
        if (!old && newValues.length === 0) return undefined;

        const oldValues = old?.values ?? [];
        let operator: FilterValue<'date', TData>['operator'];

        if (newValues.length > 1) {
          operator = 'is between';
        } else if (newValues.length === 1) {
          operator = 'is';
        } else {
          return undefined; // Clear filter if no dates
        }

        // Determine operator based on transition if old value exists
        if (old) {
          if (oldValues.length < newValues.length) {
            operator = 'is between';
          } else if (oldValues.length > newValues.length) {
            operator = 'is';
          } else {
            operator = old.operator; // Keep existing operator if length is same
          }
        }

        return { operator, values: newValues, columnMeta: meta };
      });
    },
    [column]
  );

  return (
    <Command>
      <CommandList className={MAX_H_FIT_CLASS}>
        <CommandGroup>
          <div>
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={changeDateRange}
              numberOfMonths={1}
            />
          </div>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function PropertyFilterTextValueMenu<TData extends RowData>({
  column,
}: PropertyFilterTextValueMenuProps<TData>) {
  const filter = column.getFilterValue() as
    | FilterValue<'text', TData>
    | undefined;

  const changeText = useCallback(
    (value: string | number) => {
      column.setFilterValue((old: FilterValue<'text', TData> | undefined) => {
        const { meta } = column.columnDef;
        const stringValue = String(value);

        // Clear filter if input is empty
        if (stringValue.trim() === '') {
          return undefined;
        }

        if (!old) {
          return {
            operator: 'contains',
            values: [stringValue],
            columnMeta: meta,
          };
        }
        return {
          operator: old.operator,
          values: [stringValue],
          columnMeta: meta,
        };
      });
    },
    [column]
  );

  return (
    <Command>
      <CommandList className={MAX_H_FIT_CLASS}>
        <CommandGroup>
          <CommandItem>
            <DebouncedInput
              placeholder={PLACEHOLDER_SEARCH}
              autoFocus
              value={filter?.values[0] ?? ''}
              onChange={changeText}
            />
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function PropertyFilterNumberValueMenu<TData extends RowData, TValue>({
  column,
  columnMeta,
}: PropertyFilterNumberValueMenuProps<TData, TValue>) {
  const maxFromMeta = columnMeta.max;
  const cappedMax = useMemo(
    () => maxFromMeta ?? Number.MAX_SAFE_INTEGER,
    [maxFromMeta]
  );
  const filter = column.getFilterValue()
    ? (column.getFilterValue() as FilterValue<'number', TData>)
    : undefined;

  const isNumberRange = useMemo(
    () =>
      !!filter && numberFilterDetails[filter.operator].target === 'multiple',
    [filter]
  );

  const [datasetMin] = useMemo(
    () => column.getFacetedMinMaxValues() ?? [0, cappedMax], // Use cappedMax as default max if unknown
    [column, cappedMax]
  );

  const initialInputValues = useMemo(() => {
    if (filter?.values) {
      return filter.values.map((val) =>
        val >= cappedMax ? CAPPED_MAX_DISPLAY(cappedMax) : val.toString()
      );
    }
    // Default single value to datasetMin, range to [datasetMin, cappedMax]
    return isNumberRange
      ? [datasetMin.toString(), CAPPED_MAX_DISPLAY(cappedMax)]
      : [datasetMin.toString()];
  }, [filter?.values, cappedMax, datasetMin, isNumberRange]);

  const [inputValues, setInputValues] = useState<string[]>(initialInputValues);

  // Update inputValues if the filter changes externally or tab changes
  useEffect(() => {
    setInputValues(initialInputValues);
  }, [initialInputValues]);

  const changeNumberFilter = useCallback(
    (
      newValues: number[],
      newOperator?: FilterValue<'number', TData>['operator']
    ) => {
      column.setFilterValue((old: FilterValue<'number', TData> | undefined) => {
        const { meta } = column.columnDef;
        // Use newOperator if provided, otherwise old, default to 'is'
        const operator = newOperator ?? old?.operator ?? 'is';
        // Ensure operator is a valid key for numberFilterDetails
        const currentOperator = Object.keys(numberFilterDetails).includes(
          operator
        )
          ? (operator as NumberFilterOperator)
          : 'is'; // Default to 'is' if invalid
        const operatorDetails = numberFilterDetails[currentOperator];
        let finalValues: number[];

        const sortedValues = [...newValues].sort((a, b) => a - b);

        if (operatorDetails.target === 'single') {
          finalValues = [sortedValues[0] ?? datasetMin]; // Default to min if undefined
        } else {
          const minVal =
            sortedValues[0] >= cappedMax
              ? cappedMax
              : (sortedValues[0] ?? datasetMin);
          const maxVal =
            sortedValues[1] >= cappedMax
              ? Number.POSITIVE_INFINITY
              : (sortedValues[1] ?? cappedMax); // Use cappedMax for default max range
          finalValues = [minVal, maxVal];
        }

        // Don't create filter if values are default/empty for range
        if (
          operatorDetails.target === 'multiple' &&
          finalValues[0] === datasetMin &&
          finalValues[1] === Number.POSITIVE_INFINITY
        ) {
          // Potentially clear filter here if desired, or keep default range
          // return undefined;
        }

        return {
          operator: currentOperator,
          values: finalValues,
          columnMeta: meta,
        } satisfies FilterValue<'number', TData>; // Add satisfies for type check
      });
    },
    [column, datasetMin, cappedMax]
  );

  const handleInputChange = useCallback(
    (index: number, value: string) => {
      const newValues = [...inputValues];
      let processedValue = value;

      // Handle '+ ' suffix for max value in range input
      if (
        isNumberRange &&
        index === 1 &&
        value.endsWith(CAPPED_MAX_DISPLAY_SUFFIX)
      ) {
        processedValue = value.slice(0, -1 * CAPPED_MAX_DISPLAY_SUFFIX.length); // Keep the '+' for display if desired, parse number
      }

      const numValue = Number.parseInt(processedValue, 10);

      // Special handling for the max capped value display
      if (numValue >= cappedMax) {
        newValues[index] = CAPPED_MAX_DISPLAY(cappedMax);
      } else {
        newValues[index] = value; // Store raw input for controlled component
      }

      setInputValues(newValues);

      const parsedValues = newValues.map((val) => {
        if (val.trim() === '') return datasetMin; // Default empty input to min
        if (val === CAPPED_MAX_DISPLAY(cappedMax)) return cappedMax; // Use cappedMax for parsing
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? datasetMin : parsed; // Default NaN to min
      });

      changeNumberFilter(parsedValues);
    },
    [inputValues, isNumberRange, cappedMax, datasetMin, changeNumberFilter]
  );

  const changeTabType = useCallback(
    (tabValue: string) => {
      const type = tabValue === NUMBER_FILTER_TYPE_RANGE ? 'range' : 'single';
      const newOperator = type === 'range' ? 'is between' : 'is';
      const currentNumValues = inputValues.map((v) => {
        if (v === CAPPED_MAX_DISPLAY(cappedMax)) return cappedMax;
        const parsed = Number.parseInt(v, 10);
        return Number.isNaN(parsed) ? datasetMin : parsed;
      });

      let newValuesForFilter: number[];
      let newValuesForInput: string[];

      if (type === 'single') {
        newValuesForFilter = [currentNumValues[0] ?? datasetMin];
        newValuesForInput = [newValuesForFilter[0].toString()];
      } else {
        // Default range: [currentMin or datasetMin, cappedMax]
        const minVal = currentNumValues[0] ?? datasetMin;
        newValuesForFilter = [minVal, Number.POSITIVE_INFINITY]; // Use infinity for filter logic
        newValuesForInput = [minVal.toString(), CAPPED_MAX_DISPLAY(cappedMax)]; // Use display string for input
      }

      setInputValues(newValuesForInput);
      changeNumberFilter(newValuesForFilter, newOperator);
    },
    [inputValues, cappedMax, datasetMin, changeNumberFilter]
  );

  const handleSliderChange = useCallback(
    (newSliderValues: number[]) => {
      // Ensure slider values don't exceed cappedMax visually
      const adjustedValues = newSliderValues.map((val) =>
        Math.min(val, cappedMax)
      );

      setInputValues(
        adjustedValues.map((v) =>
          v >= cappedMax ? CAPPED_MAX_DISPLAY(cappedMax) : v.toString()
        )
      );
      // Use potentially infinite value for the actual filter if max is hit
      const filterValues = adjustedValues.map((v) =>
        v >= cappedMax ? Number.POSITIVE_INFINITY : v
      );
      changeNumberFilter(filterValues);
    },
    [cappedMax, changeNumberFilter]
  );

  const currentTab = isNumberRange
    ? NUMBER_FILTER_TYPE_RANGE
    : NUMBER_FILTER_TYPE_SINGLE;
  const sliderValue = useMemo(
    () =>
      inputValues.map((val) => {
        if (val === '' || val === CAPPED_MAX_DISPLAY(cappedMax)) {
          return cappedMax;
        }
        const parsed = Number.parseInt(val, 10);
        if (Number.isNaN(parsed)) {
          return datasetMin;
        }
        return Math.min(parsed, cappedMax); // Cap slider max visually
      }),
    [inputValues, cappedMax, datasetMin]
  );

  const handleSingleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      handleInputChange(0, e.target.value),
    [handleInputChange]
  );
  const handleMinInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      handleInputChange(0, e.target.value),
    [handleInputChange]
  );
  const handleMaxInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      handleInputChange(1, e.target.value),
    [handleInputChange]
  );
  const handleSingleSliderChange = useCallback(
    (value: number[]) => handleSliderChange([value[0]]),
    [handleSliderChange]
  );

  // Constant for the capped max placeholder string
  const cappedMaxPlaceholder = useMemo(
    () => CAPPED_MAX_DISPLAY(cappedMax),
    [cappedMax]
  );

  // Define pattern constant for max input
  const maxInputPattern = useMemo(() => {
    // eslint-disable-next-line no-useless-escape
    return `^\\d*\\${CAPPED_MAX_DISPLAY_SUFFIX}?|^${cappedMax}\\${CAPPED_MAX_DISPLAY_SUFFIX}?`;
  }, [cappedMax]);

  // Calculate max value for the 'Min' input clearly
  const maxForMinInput = useMemo(() => {
    const maxInputValue = inputValues[1];
    if (maxInputValue === cappedMaxPlaceholder) {
      return cappedMax - 1;
    }
    // Default to cappedMax if parsing fails or input is empty
    const parsedMaxValue =
      parseInt(maxInputValue || cappedMax.toString(), 10) || cappedMax;
    return parsedMaxValue - 1;
  }, [inputValues, cappedMax, cappedMaxPlaceholder]);

  return (
    <Command>
      <CommandList className="w-[300px] px-2 py-2">
        <CommandGroup>
          <div className="flex flex-col w-full">
            <Tabs value={currentTab} onValueChange={changeTabType}>
              <TabsList className={cn('w-full', TEXT_XS_CLASS)}>
                <TabsTrigger value={NUMBER_FILTER_TYPE_SINGLE}>
                  Single
                </TabsTrigger>
                <TabsTrigger value={NUMBER_FILTER_TYPE_RANGE}>
                  Range
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value={NUMBER_FILTER_TYPE_SINGLE}
                className="flex flex-col gap-4 mt-4"
              >
                <Slider
                  value={[sliderValue[0]]} // Slider expects array
                  onValueChange={handleSingleSliderChange}
                  min={datasetMin}
                  max={cappedMax} // Input max validation
                />
                <div className="flex items-center gap-2">
                  <span className={cn(TEXT_XS_CLASS, FONT_MEDIUM_CLASS)}>
                    Value
                  </span>
                  <Input
                    id="single"
                    type="number"
                    value={inputValues[0]}
                    onChange={handleSingleInputChange}
                    min={datasetMin}
                    max={cappedMax} // Input max validation
                  />
                </div>
              </TabsContent>
              <TabsContent
                value={NUMBER_FILTER_TYPE_RANGE}
                className="flex flex-col gap-4 mt-4"
              >
                <Slider
                  value={sliderValue}
                  onValueChange={handleSliderChange}
                  min={datasetMin}
                  max={cappedMax} // Visual max for slider
                />
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <span className={cn(TEXT_XS_CLASS, FONT_MEDIUM_CLASS)}>
                      Min
                    </span>
                    <Input
                      type="number"
                      value={inputValues[0]}
                      onChange={handleMinInputChange}
                      min={datasetMin}
                      max={maxForMinInput} // Use calculated max value
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(TEXT_XS_CLASS, FONT_MEDIUM_CLASS)}>
                      Max
                    </span>
                    <Input
                      type="text" // Use text to allow '+'
                      value={inputValues[1]}
                      placeholder={cappedMaxPlaceholder}
                      onChange={handleMaxInputChange}
                      // Basic pattern validation, more robust validation in handler
                      pattern={maxInputPattern} // Use constant
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
