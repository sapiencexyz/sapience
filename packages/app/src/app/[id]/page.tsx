'use client';

import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  useReactTable,
  getCoreRowModel,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { formatUnits } from 'viem';

import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import CandlestickChart from '~/lib/components/chart';
import NumberDisplay from '~/lib/components/foil/numberDisplay';
import { MarketLayout } from '~/lib/components/market/MarketLayout';
import { ResourceNav } from '~/lib/components/market/ResourceNav';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MARKET_CATEGORIES } from '~/lib/constants/markets';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { useLatestResourcePrice } from '~/lib/hooks/useResources';
import { TimeWindow } from '~/lib/interfaces/interfaces';

interface ResourcePrice {
  timestamp: string;
  value: string;
}

interface ResourcePricePoint {
  timestamp: number;
  price: number;
}

interface Epoch {
  id: number;
  epochId: number;
  startTimestamp: number;
  endTimestamp: number;
  market: {
    address: string;
    chainId: number;
  };
}

const columns: ColumnDef<Epoch>[] = [
  {
    id: 'epochId',
    cell: ({ row }) => (
      <span className="font-medium">#{row.original.epochId}</span>
    ),
  },
  {
    id: 'dates',
    cell: ({ row }) => {
      const epoch = row.original;
      const formatDate = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      };

      const now = Date.now();
      const getRelativeTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return formatDistanceToNow(date, { addSuffix: true });
      };

      const isStarted = now / 1000 >= epoch.startTimestamp;
      const isEnded = now / 1000 >= epoch.endTimestamp;

      const getRelativeText = () => {
        if (isEnded) {
          return `ended ${getRelativeTime(epoch.endTimestamp)}`;
        }
        if (isStarted) {
          return `ends ${getRelativeTime(epoch.endTimestamp)}`;
        }
        return `starts ${getRelativeTime(epoch.startTimestamp)}`;
      };

      const relativeText = getRelativeText();

      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center">
            <span className="text-sm">{formatDate(epoch.startTimestamp)}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground mx-1" />
            <span className="text-sm">{formatDate(epoch.endTimestamp)}</span>
          </div>
          <span className="text-xs text-muted-foreground">{relativeText}</span>
        </div>
      );
    },
  },
  {
    id: 'price',
    cell: () => (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm">50 gwei</span>
        <span className="text-xs text-muted-foreground">
          500 gGas Liquidity
        </span>
      </div>
    ),
  },
  {
    id: 'actions',
    cell: () => <ChevronRight className="h-6 w-6 text-muted-foreground" />,
  },
];

const EpochsTable = ({ data }: { data: Epoch[] }) => {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table className="border-y border-border">
      <TableBody>
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && 'selected'}
              className="cursor-pointer hover:bg-accent/50 border-0"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="border-0 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="h-24 text-center border-0"
            >
              No results.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

// Add placeholder data generation
const generatePlaceholderPrices = () => {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  const prices = [];
  let basePrice = 1750;

  for (let i = 30; i >= 0; i--) {
    const startTimestamp = now - i * dayInMs;
    const endTimestamp = startTimestamp + dayInMs;
    const volatility = 50;
    const open = basePrice + (Math.random() - 0.5) * volatility;
    const close = basePrice + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + (Math.random() * volatility) / 2;
    const low = Math.min(open, close) - (Math.random() * volatility) / 2;

    prices.push({
      startTimestamp,
      endTimestamp,
      open,
      close,
      high,
      low,
    });

    basePrice = close;
  }

  return prices;
};

const generatePlaceholderIndexPrices = () => {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  const prices = [];
  let basePrice = 1750;

  for (let i = 30; i >= 0; i--) {
    const timestamp = now - i * dayInMs;
    const volatility = 30;
    basePrice += (Math.random() - 0.5) * volatility;

    prices.push({
      timestamp: Math.floor(timestamp / 1000),
      price: basePrice,
    });
  }

  return prices;
};

const renderPriceDisplay = (
  isLoading: boolean,
  price: ResourcePrice | undefined
) => {
  if (isLoading) {
    return <span className="text-2xl font-bold">Loading...</span>;
  }

  if (!price) {
    return <span className="text-2xl font-bold">No price data</span>;
  }

  return (
    <span className="text-2xl font-bold">
      <NumberDisplay value={formatUnits(BigInt(price.value), 9)} /> gwei
    </span>
  );
};

const MarketContent = ({ params }: { params: { id: string } }) => {
  const { markets } = useMarketList();
  const category = MARKET_CATEGORIES.find((c) => c.id === params.id);
  const { data: latestPrice, isLoading: isPriceLoading } =
    useLatestResourcePrice(params.id);

  const { data: resourcePrices, isLoading: isResourcePricesLoading } = useQuery<
    ResourcePrice[]
  >({
    queryKey: ['resourcePrices', params.id],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/resources/${params.id}/prices`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch resource prices');
      }
      return response.json();
    },
    refetchInterval: 2000,
  });

  if (!category) {
    return (
      <div className="flex justify-center items-center py-8">
        <p>Resource not found</p>
      </div>
    );
  }

  const epochs = markets
    .filter((market) => market.public)
    .flatMap((market) =>
      (market.epochs || []).map((epoch) => ({
        ...epoch,
        market: {
          address: market.address,
          chainId: market.chainId,
        },
      }))
    );

  const placeholderPrices = generatePlaceholderPrices();
  const placeholderIndexPrices = generatePlaceholderIndexPrices();

  const formattedResourcePrices: ResourcePricePoint[] =
    resourcePrices?.map((price) => ({
      timestamp: Number(price.timestamp) * 1000,
      price: Number(formatUnits(BigInt(price.value), 9)),
    })) || [];

  return (
    <div className="flex flex-col md:flex-row h-full">
      <div className="flex-1 min-w-0">
        <div className="flex flex-col h-full">
          <div className="flex-1 grid relative">
            <Card className="absolute top-8 left-8 z-10">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">
                    Current Price
                  </span>
                  <div className="flex items-baseline gap-2">
                    {renderPriceDisplay(isPriceLoading, latestPrice)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <CandlestickChart
              data={{
                marketPrices: [],
                indexPrices: [],
                resourcePrices: formattedResourcePrices,
              }}
              activeWindow={TimeWindow.D}
              isLoading={isResourcePricesLoading}
            />
          </div>
        </div>
      </div>
      <div className="hidden w-full md:w-[400px] border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0">
        <h2 className="text-base font-medium text-muted-foreground px-4 py-2">
          Periods
        </h2>
        <EpochsTable data={epochs} />
      </div>
    </div>
  );
};

const MarketPage = ({ params }: { params: { id: string } }) => {
  return (
    <MarketLayout
      nav={<ResourceNav />}
      content={<MarketContent params={params} />}
    />
  );
};

export default MarketPage;
