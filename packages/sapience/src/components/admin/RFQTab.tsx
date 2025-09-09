'use client';

import type { ColumnDef } from '@tanstack/react-table';
import DataTable from './data-table';

type RFQRow = {
  id?: string | number;
  question: string;
  category?: { name?: string; slug?: string };
  endTime?: string | Date;
  public?: boolean;
  claimStatement: string;
  description: string;
  similarMarketUrls?: string[];
};

const columns: ColumnDef<RFQRow>[] = [
  {
    header: 'ID',
    accessorKey: 'id',
    sortingFn: 'alphanumeric',
  },
  {
    header: 'Question',
    accessorKey: 'question',
  },
  {
    id: 'category',
    header: 'Category',
    accessorFn: (row) => row.category?.name ?? row.category?.slug ?? '',
    sortingFn: 'alphanumeric',
  },
  {
    header: 'End Time',
    accessorKey: 'endTime',
    cell: ({ getValue }) => {
      const value = getValue() as string | Date | undefined;
      if (!value) return '';
      const date = typeof value === 'string' ? new Date(value) : value;
      return Number.isNaN(date.getTime())
        ? String(value)
        : date.toLocaleString();
    },
  },
  {
    header: 'Public',
    accessorKey: 'public',
    cell: ({ getValue }) => {
      const value = getValue() as boolean | undefined;
      return value ? 'Yes' : 'No';
    },
  },
  {
    header: 'Claim Statement',
    accessorKey: 'claimStatement',
  },
  {
    header: 'Description/Rules',
    accessorKey: 'description',
  },
  {
    id: 'similarMarketUrls',
    header: 'Similar Markets',
    accessorFn: (row) => row.similarMarketUrls?.join(', ') ?? '',
  },
  {
    id: 'settle',
    header: 'Settle',
    enableSorting: false,
    cell: () => (
      <div className="flex items-center gap-2">
        <button type="button" className="text-green-600 hover:underline">
          Yes
        </button>
        <button type="button" className="text-red-600 hover:underline">
          No
        </button>
      </div>
    ),
  },
];

const data: RFQRow[] = [];

const RFQTab = () => {
  return (
    <div className="py-6">
      <DataTable columns={columns} data={data} />
    </div>
  );
};

export default RFQTab;
