'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as React from 'react';

import DataTablePagination from './data-table-pagination';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  categoryFilter?: string | null;
}

export default function DataTable<
  TData extends { category?: { slug?: string } },
  TValue,
>({ columns, data, categoryFilter }: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // Apply category filter if provided
  React.useEffect(() => {
    if (categoryFilter) {
      setColumnFilters((prev) => {
        // Remove any existing category filter
        const filtered = prev.filter(
          (filter) => filter.id !== 'categoryFilter'
        );
        // Add new category filter
        return [
          ...filtered,
          {
            id: 'categoryFilter',
            value: categoryFilter,
          },
        ];
      });
    } else {
      // Remove category filter if categoryFilter is null
      setColumnFilters((prev) =>
        prev.filter((filter) => filter.id !== 'categoryFilter')
      );
    }
  }, [categoryFilter]);

  // Build a memoized columns array that includes a hidden virtual column for category filtering
  // We avoid `any` by constraining `TData` to include an optional `category.slug` field (see the
  // generic constraint on `DataTable` below) and by specifying an explicit value type for the
  // virtual column (string | undefined).
  const columnsWithCategoryFilter = React.useMemo(() => {
    const categoryFilterColumn: ColumnDef<TData, string | undefined> = {
      id: 'categoryFilter',
      accessorFn: (row) => row.category?.slug,
      enableHiding: true,
      filterFn: 'equals',
    };

    return [...columns, categoryFilterColumn];
  }, [columns]);

  const table = useReactTable({
    data,
    columns: columnsWithCategoryFilter,
    state: {
      sorting,
      columnVisibility: {
        ...columnVisibility,
        categoryFilter: false, // Always hide the virtual category column
      },
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: (vis) => {
      // Ensure the categoryFilter column stays hidden
      setColumnVisibility({ ...vis, categoryFilter: false });
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
