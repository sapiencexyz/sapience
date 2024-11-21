import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { Loader2, Copy } from 'lucide-react';
import Link from 'next/link';
import { useContext, useState, useMemo, useEffect } from 'react';
import { getEnsName } from 'viem/ens';
import { usePublicClient } from 'wagmi';

import { badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';
import { calculatePnL } from '~/lib/util/positionUtil';

import NumberDisplay from './numberDisplay';

interface Props {
  params: {
    id: string;
    epoch: string;
  };
}

interface Position {
  positionId: string;
  chain?: {
    id: string;
  };
  address: string;
  isLP: boolean;
  owner: string;
}

interface GroupedPosition {
  owner: string;
  positions: Position[];
  totalPnL: number;
}

const useEpochPositions = (marketId: string, epochId: string) => {
  return useQuery({
    queryKey: ['epochPositions', marketId, epochId],
    queryFn: async () => {
      // Get trader positions
      const traderResponse = await fetch(
        `${API_BASE_URL}/positions?contractId=${marketId}&isLP=false`
      );
      if (!traderResponse.ok) {
        throw new Error('Failed to fetch trader positions');
      }

      // Get LP positions
      const lpResponse = await fetch(
        `${API_BASE_URL}/positions?contractId=${marketId}&isLP=true`
      );
      if (!lpResponse.ok) {
        throw new Error('Failed to fetch LP positions');
      }

      const [traderPositions, lpPositions] = await Promise.all([
        traderResponse.json(),
        lpResponse.json(),
      ]);

      return [...traderPositions, ...lpPositions];
    },
  });
};

const PositionCell = ({ row }: { row: { original: GroupedPosition } }) => (
  <div className="flex flex-wrap gap-1.5 w-[160px]">
    {row.original.positions.map((position, index) => (
      <Link
        key={position.positionId}
        href={`/positions/${position.chain?.id}:${position.address}/${position.positionId}`}
        className={`${badgeVariants({ variant: 'outline' })} hover:bg-muted transition-background`}
      >
        #{position.positionId.toString()}
      </Link>
    ))}
  </div>
);

const PnLCell = ({ cell }: { cell: { getValue: () => unknown } }) => {
  const value = cell.getValue() as number;
  const prefix = value > 0 ? '+' : '';
  return (
    <span className="md:text-xl whitespace-nowrap">
      {prefix}
      <NumberDisplay value={value} /> wstETH
    </span>
  );
};

const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const AddressDisplay = ({ address }: { address: string }) => {
  const publicClient = usePublicClient();
  const [ensName, setEnsName] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    const resolveEns = async () => {
      if (!publicClient) return;
      try {
        const ens = await getEnsName(publicClient, {
          address: address as `0x${string}`,
        });
        if (ens) setEnsName(ens);
      } catch (error) {
        console.error('Error resolving ENS:', error);
      }
    };
    resolveEns();
  }, [address, publicClient]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1000);
  };

  return (
    <div className="flex items-center gap-2 md:text-xl">
      <span>{ensName || formatAddress(address)}</span>
      <TooltipProvider>
        <Tooltip open={showCopied}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0.5"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copied!</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

const OwnerCell = ({ cell }: { cell: { getValue: () => unknown } }) => (
  <AddressDisplay address={cell.getValue() as string} />
);

const RankCell = ({ row }: { row: { index: number } }) => (
  <span className="text-xl md:text-4xl font-bold flex justify-center">
    {row.index + 1}
  </span>
);

const Leaderboard = ({ params }: Props) => {
  const { pool } = useContext(MarketContext);
  const { data: positions, isLoading } = useEpochPositions(
    params.id,
    params.epoch
  );

  const columns = useMemo<ColumnDef<GroupedPosition>[]>(
    () => [
      {
        id: 'rank',
        header: 'Rank',
        cell: RankCell,
      },
      {
        id: 'owner',
        header: 'Wallet Address',
        accessorFn: (row) => row.owner,
        cell: OwnerCell,
      },
      {
        id: 'pnl',
        header: 'Profit/Loss',
        accessorFn: (row) => row.totalPnL,
        cell: PnLCell,
      },
      {
        id: 'positions',
        header: 'Positions',
        cell: PositionCell,
      },
    ],
    [pool]
  );

  const groupedPositions = useMemo(() => {
    if (!positions) return [] as GroupedPosition[];

    // Group positions by owner
    const groupedByOwner = positions.reduce<Record<string, GroupedPosition>>(
      (acc, position) => {
        if (!acc[position.owner]) {
          acc[position.owner] = {
            owner: position.owner,
            positions: [],
            totalPnL: 0,
          };
        }
        acc[position.owner].positions.push(position);
        acc[position.owner].totalPnL += calculatePnL(position, pool);
        return acc;
      },
      {}
    );

    // Convert to array and sort by total PnL
    return Object.values(groupedByOwner).sort(
      (a, b) => b.totalPnL - a.totalPnL
    );
  }, [positions, pool]);

  const table = useReactTable<GroupedPosition>({
    data: groupedPositions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 w-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-screen-md mx-auto flex items-center p-12">
      <div className="border border-border rounded-lg w-full">
        <h1 className="text-2xl md:text-5xl font-bold mb-2 md:mt-10 md:mb-8 text-center">
          🏆 Leaderboard 🏆
        </h1>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-transparent">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Leaderboard;
