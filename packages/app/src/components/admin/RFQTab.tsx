'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { Textarea } from '@sapience/ui/components/ui/textarea';
import { Switch } from '@sapience/ui/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@sapience/ui/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
// Simple progress component since it doesn't exist in the UI library
const Progress = ({
  value,
  className,
}: {
  value: number;
  className?: string;
}) => (
  <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
    <div
      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
      style={{ width: `${value}%` }}
    />
  </div>
);
import { Badge } from '@sapience/ui/components/ui/badge';
import { useToast } from '@sapience/ui/hooks/use-toast';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Copy, Upload, FileText, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow, fromUnixTime } from 'date-fns';
import { useReadContract, useReadContracts } from 'wagmi';
import { keccak256, concatHex, toHex, isAddress } from 'viem';
import {
  lzUmaResolver,
  lzPMResolver,
  manualConditionResolver,
  pythConditionResolver,
  predictionMarketLZConditionalTokensResolver,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID, CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import DateTimePicker from '../shared/DateTimePicker';
import DataTable from './data-table';
import ResolveConditionCell from './ResolveConditionCell';
import { parseCsv, mapCsv } from '~/lib/utils/csv';
import { useAdminApi } from '~/hooks/useAdminApi';
import { useCategories } from '~/hooks/graphql/useCategories';
import { useConditions } from '~/hooks/graphql/useConditions';

type RFQRow = {
  id?: string;
  question: string;
  shortName?: string | null;
  category?: { id?: number; name?: string; slug?: string };
  conditionGroup?: { id?: number; name?: string } | null;
  endTime?: number;
  public?: boolean;
  claimStatement: string;
  description: string;
  similarMarketUrls?: string[];
  chainId?: number;
  resolver?: string | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  assertionId?: string;
  assertionTimestamp?: number;
  _isSettled?: boolean;
  _hasData?: boolean;
};

type CSVRow = {
  question: string;
  categorySlug?: string;
  endTimeUTC: string;
  public?: string;
  claimStatement: string;
  description: string;
  shortName?: string;
  similarMarkets?: string;
  group?: string;
  resolver: string;
};

type ValidatedCSVRow = CSVRow & {
  rowIndex: number;
  isValid: boolean;
  errors: string[];
  parsedEndTime?: number;
  parsedPublic?: boolean;
  parsedSimilarMarkets?: string[];
  parsedGroup?: string;
  parsedResolver?: string;
};

type RFQTabProps = {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  // Optional external control for CSV Import dialog
  csvImportOpen?: boolean;
  onCsvImportOpenChange?: (open: boolean) => void;
  // Optional action buttons to render on the right side of the filter row
  actionButtons?: React.ReactNode;
};

type ConditionFilter = 'all' | 'needs-settlement' | 'upcoming' | 'settled';
type VisibilityFilter = 'all' | 'public' | 'private';

const RFQTab = ({
  createOpen,
  setCreateOpen,
  csvImportOpen: csvImportOpenProp,
  onCsvImportOpenChange,
  actionButtons,
}: RFQTabProps) => {
  const { toast } = useToast();
  const { postJson, putJson } = useAdminApi();
  const { data: categories } = useCategories();

  const currentChainId = DEFAULT_CHAIN_ID;
  const currentChainName = 'Ethereal';

  const [question, setQuestion] = useState('');
  const [shortName, setShortName] = useState('');
  const [categorySlug, setCategorySlug] = useState<string>('');
  const [endTime, setEndTime] = useState<number>(0);
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [claimStatement, setClaimStatement] = useState('');
  const [description, setDescription] = useState('');
  const [similarMarketsText, setSimilarMarketsText] = useState('');
  const [groupName, setGroupName] = useState('');
  const [resolver, setResolver] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [editingChainId, setEditingChainId] = useState<number | undefined>(
    undefined
  );
  const [filter, setFilter] = useState<ConditionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>('all');
  const [chainFilter, setChainFilter] = useState<string>('all');

  // V2 state
  const [protocolVersion, setProtocolVersion] = useState<'v1' | 'v2'>('v1');
  const [v2ConditionId, setV2ConditionId] = useState('');
  const [v2ResolverType, setV2ResolverType] = useState<
    'manual' | 'pyth' | 'uma-lz' | 'conditional-tokens'
  >('manual');
  const [v2ChainId, setV2ChainId] = useState<number>(13374202); // Default to Ethereal Testnet

  // V2 resolver address helper
  const V2_RESOLVER_MAP = {
    manual: manualConditionResolver,
    pyth: pythConditionResolver,
    'uma-lz': lzPMResolver,
    'conditional-tokens': predictionMarketLZConditionalTokensResolver,
  };

  const getV2ResolverAddress = (
    type: keyof typeof V2_RESOLVER_MAP,
    chainId: number
  ): string | null => {
    const resolver = V2_RESOLVER_MAP[type];
    return resolver?.[chainId]?.address ?? null;
  };

  const {
    data: conditions,
    isLoading,
    refetch,
  } = useConditions({
    take: 500,
    // When 'all' is selected, don't pass chainId to get all chains
    ...(chainFilter !== 'all' ? { chainId: Number(chainFilter) } : {}),
    filters: {
      visibility: visibilityFilter,
    },
  });
  const umaWrappedMarketAbi = [
    {
      inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
      name: 'wrappedMarkets',
      outputs: [
        { internalType: 'bytes32', name: 'marketId', type: 'bytes32' },
        { internalType: 'bool', name: 'assertionSubmitted', type: 'bool' },
        { internalType: 'bool', name: 'settled', type: 'bool' },
        { internalType: 'bool', name: 'resolvedToYes', type: 'bool' },
        { internalType: 'bytes32', name: 'assertionId', type: 'bytes32' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const;

  const settlementStatusContracts = useMemo(() => {
    return (conditions || []).map((c) => {
      let marketId: `0x${string}` | undefined;
      try {
        if (c.claimStatement && c.endTime) {
          const claimHex = toHex(c.claimStatement);
          const colonHex = toHex(':');
          const endTimeHex = toHex(BigInt(c.endTime), { size: 32 });
          const packed = concatHex([claimHex, colonHex, endTimeHex]);
          marketId = keccak256(packed);
        }
      } catch {
        marketId = undefined;
      }

      const chainId = c.chainId || DEFAULT_CHAIN_ID;
      // Use lzPMResolver if available (e.g. Ethereal), otherwise fallback to lzUmaResolver (e.g. Arbitrum)
      const address =
        lzPMResolver[chainId]?.address || lzUmaResolver[chainId]?.address;

      return {
        address,
        abi: umaWrappedMarketAbi,
        functionName: 'wrappedMarkets' as const,
        args: marketId ? [marketId] : undefined,
        chainId,
      };
    });
  }, [conditions]);

  const { data: settlementData } = useReadContracts({
    contracts: settlementStatusContracts,
    query: { enabled: conditions && conditions.length > 0 },
  });

  // CSV Import state (support controlled or uncontrolled usage)
  const [csvImportOpenInternal, setCsvImportOpenInternal] = useState(false);
  const csvImportOpen = csvImportOpenProp ?? csvImportOpenInternal;
  const setCsvImportOpen = onCsvImportOpenChange ?? setCsvImportOpenInternal;
  const [, setCsvFile] = useState<File | null>(null);
  const [validatedRows, setValidatedRows] = useState<ValidatedCSVRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const resetForm = () => {
    setQuestion('');
    setShortName('');
    setCategorySlug('');
    setEndTime(0);
    setIsPublic(true);
    setClaimStatement('');
    setDescription('');
    setSimilarMarketsText('');
    setGroupName('');
    setResolver('');
    setEditingId(undefined);
    setEditingChainId(undefined);
    // V2 fields
    setProtocolVersion('v1');
    setV2ConditionId('');
    setV2ResolverType('manual');
    setV2ChainId(13374202);
  };

  // CSV Import helper functions
  const validateCSVRow = (row: CSVRow, rowIndex: number): ValidatedCSVRow => {
    const errors: string[] = [];
    let parsedEndTime: number | undefined;
    let parsedPublic: boolean | undefined;
    let parsedSimilarMarkets: string[] | undefined;
    let parsedResolver: string | undefined;

    // Validate required fields
    if (!row.question?.trim()) errors.push('Question is required');
    if (!row.endTimeUTC?.trim()) errors.push('End time is required');
    if (!row.claimStatement?.trim()) errors.push('Claim statement is required');
    if (!row.description?.trim()) errors.push('Description is required');
    if (!row.resolver?.trim()) {
      errors.push('Resolver address is required');
    } else {
      const trimmedResolver = row.resolver.trim();
      if (!isAddress(trimmedResolver as `0x${string}`)) {
        errors.push('Resolver must be a valid Ethereum address (0x...)');
      } else {
        parsedResolver = trimmedResolver.toLowerCase();
      }
    }

    // Validate end time
    if (row.endTimeUTC?.trim()) {
      const timestamp = parseInt(row.endTimeUTC.trim(), 10);
      if (Number.isNaN(timestamp)) {
        errors.push('End time must be a valid Unix timestamp');
      } else if (timestamp <= Math.floor(Date.now() / 1000)) {
        errors.push('End time must be in the future');
      } else {
        parsedEndTime = timestamp;
      }
    }

    // Validate public field
    if (row.public !== undefined && row.public !== '') {
      const publicValue = row.public.toLowerCase().trim();
      if (publicValue === 'true') {
        parsedPublic = true;
      } else if (publicValue === 'false') {
        parsedPublic = false;
      } else {
        errors.push('Public must be "true" or "false"');
      }
    } else {
      parsedPublic = true; // Default to true if not specified
    }

    // Parse similar markets
    if (row.similarMarkets?.trim()) {
      parsedSimilarMarkets = row.similarMarkets
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
    }

    // Parse group (optional, any non-empty string is valid)
    const parsedGroup = row.group?.trim() || undefined;

    return {
      ...row,
      rowIndex,
      isValid: errors.length === 0,
      errors,
      parsedEndTime,
      parsedPublic,
      parsedSimilarMarkets,
      parsedGroup,
      parsedResolver,
    };
  };

  const handleFileUpload = async (file: File) => {
    setCsvFile(file);
    setValidatedRows([]);
    setImportResults(null);

    try {
      const text = await file.text();
      const { headers, rows, errors } = parseCsv(text, ',');
      if (errors.length > 0) {
        toast({
          variant: 'destructive',
          title: 'CSV Parsing Warning',
          description: errors.join(', '),
        });
      }

      // Expecting header row to include the specific keys; map rows to objects.
      const objects = mapCsv(headers, rows) as unknown as CSVRow[];
      const validated = objects.map((row: CSVRow, index: number) =>
        validateCSVRow(row, index + 1)
      );
      setValidatedRows(validated);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'CSV Read Error',
        description: (err as Error)?.message || 'Failed to read file',
      });
    }
  };

  const handleImport = async () => {
    const validRows = validatedRows.filter((row) => row.isValid);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportResults(null);

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const batchSize = 3;

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (row) => {
          try {
            const body = {
              question: row.question.trim(),
              ...(row.shortName && row.shortName.trim()
                ? { shortName: row.shortName.trim() }
                : {}),
              ...(row.categorySlug
                ? { categorySlug: row.categorySlug.trim() }
                : {}),
              endTime: row.parsedEndTime!,
              public: row.parsedPublic ?? true,
              claimStatement: row.claimStatement.trim(),
              description: row.description.trim(),
              similarMarkets: row.parsedSimilarMarkets || [],
              chainId: currentChainId,
              resolver: row.parsedResolver!,
              ...(row.parsedGroup ? { groupName: row.parsedGroup } : {}),
            };

            await postJson<RFQRow>('/conditions', body);
            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push(
              `Row ${row.rowIndex}: ${(error as Error).message}`
            );
          }
        })
      );

      setImportProgress(
        Math.min(100, ((i + batch.length) / validRows.length) * 100)
      );
    }

    setImportResults(results);
    setIsImporting(false);

    if (results.success > 0) {
      await refetch();
    }

    toast({
      title: 'Import Complete',
      description: `Successfully imported ${results.success} conditions. ${results.failed} failed.`,
    });
  };

  const resetCsvImport = () => {
    setCsvFile(null);
    setValidatedRows([]);
    setImportResults(null);
    setImportProgress(0);
    setCsvImportOpen(false);
  };

  function ConditionStatusBadges({
    claimStatement,
    endTime,
    isSettledOverride,
    chainId,
  }: {
    claimStatement?: string;
    endTime?: number;
    isSettledOverride?: boolean;
    chainId?: number;
  }) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const isUpcoming = (endTime ?? 0) > nowSeconds;
    const isPastEnd = !!endTime && endTime <= nowSeconds;

    let marketId: `0x${string}` | undefined;
    try {
      if (claimStatement && endTime) {
        const claimHex = toHex(claimStatement);
        const colonHex = toHex(':');
        const endTimeHex = toHex(BigInt(endTime), { size: 32 });
        const packed = concatHex([claimHex, colonHex, endTimeHex]);
        marketId = keccak256(packed);
      }
    } catch {
      marketId = undefined;
    }

    const targetChainId = chainId || DEFAULT_CHAIN_ID;
    const address =
      lzPMResolver[targetChainId]?.address ||
      lzUmaResolver[targetChainId]?.address;

    const { data } = useReadContract({
      address,
      abi: umaWrappedMarketAbi,
      functionName: 'wrappedMarkets',
      args: marketId ? [marketId] : undefined,
      chainId: targetChainId,
      query: { enabled: Boolean(marketId) && isSettledOverride === undefined },
    });

    const tuple = data;
    const settled = isSettledOverride ?? Boolean(tuple?.[2] ?? false);

    return (
      <div className="flex flex-col items-start gap-1">
        {isPastEnd && settled ? (
          <Badge variant="outline" className="whitespace-nowrap">
            Settled
          </Badge>
        ) : null}
        {isPastEnd && !settled ? (
          <Badge variant="destructive" className="whitespace-nowrap">
            Needs Settlement
          </Badge>
        ) : null}
        {isUpcoming ? (
          <Badge variant="secondary" className="whitespace-nowrap">
            Upcoming
          </Badge>
        ) : null}
      </div>
    );
  }

  const columns: ColumnDef<RFQRow>[] = useMemo(
    () => [
      {
        id: 'badges',
        header: () => null,
        size: 140,
        cell: ({ row }) => (
          <ConditionStatusBadges
            claimStatement={row.original.claimStatement}
            endTime={row.original.endTime}
            isSettledOverride={row.original.settled ?? row.original._isSettled}
            chainId={row.original.chainId}
          />
        ),
      },
      {
        header: 'End Time',
        accessorKey: 'endTime',
        size: 150,
        cell: ({ getValue }) => {
          const v = getValue() as number | undefined;
          if (!v) return '';
          let relative = '';
          try {
            relative = formatDistanceToNow(fromUnixTime(v), {
              addSuffix: true,
            });
          } catch {
            // ignore formatting errors
          }
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <div className="text-sm font-medium">{relative}</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Unix timestamp: {v}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        header: 'ID',
        accessorKey: 'id',
        sortingFn: 'alphanumeric',
        size: 120,
        cell: ({ getValue }) => {
          const id = getValue() as string | undefined;
          if (!id) return '';
          const truncated =
            id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
          return (
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-mono cursor-help">{truncated}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{id}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="icon"
                onClick={async (e) => {
                  e.stopPropagation();
                  await navigator.clipboard.writeText(id);
                  toast({
                    title: 'Copied',
                    description: 'ID copied to clipboard',
                    duration: 1500,
                  });
                }}
                aria-label="Copy ID"
              >
                <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </Button>
            </div>
          );
        },
      },
      {
        header: 'Question',
        accessorKey: 'question',
        size: 300,
        cell: ({ getValue }) => {
          const question = getValue() as string;
          const isLong = question.length > 100;
          const truncated = isLong ? `${question.slice(0, 100)}...` : question;
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`cursor-help ${isLong ? 'truncate' : ''}`}
                    style={
                      isLong ? { maxHeight: '3rem', overflow: 'hidden' } : {}
                    }
                  >
                    {truncated}
                  </div>
                </TooltipTrigger>
                {isLong && (
                  <TooltipContent className="max-w-xs">
                    <p>{question}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (row) => row.category?.name ?? row.category?.slug ?? '',
        sortingFn: 'alphanumeric',
        size: 120,
      },
      {
        header: 'Chain',
        accessorKey: 'chainId',
        size: 100,
        cell: ({ getValue }) => {
          const chainId = getValue() as number;
          const chainNames: Record<number, string> = {
            5064014: 'Ethereal',
            13374202: 'Ethereal Testnet',
            42161: 'Arbitrum',
          };
          const chainName = chainNames[chainId] ?? `Chain ${chainId}`;
          return (
            <Badge variant="outline" className="whitespace-nowrap">
              {chainName}
            </Badge>
          );
        },
      },
      {
        header: 'Public',
        accessorKey: 'public',
        size: 80,
        cell: ({ getValue }) => {
          const isPublic = getValue() as boolean;
          return (
            <Badge variant={isPublic ? 'default' : 'secondary'}>
              {isPublic ? 'Yes' : 'No'}
            </Badge>
          );
        },
      },
      {
        id: 'similarMarketUrls',
        header: 'Similar Markets',
        accessorFn: (row) => row.similarMarketUrls?.join(', ') ?? '',
        size: 200,
        cell: ({ getValue }) => {
          const urls = getValue() as string;
          const urlList = urls.split(', ').filter(Boolean);
          const isLong = urls.length > 60;

          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`cursor-help ${isLong ? 'truncate' : ''}`}
                    style={
                      isLong ? { maxHeight: '3rem', overflow: 'hidden' } : {}
                    }
                  >
                    {urlList.length > 0
                      ? `${urlList.length} URL${urlList.length > 1 ? 's' : ''}`
                      : 'None'}
                  </div>
                </TooltipTrigger>
                {isLong && (
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1">
                      {urlList.map((url, index) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-blue-400 hover:text-blue-600 underline text-xs"
                        >
                          {url}
                        </a>
                      ))}
                    </div>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        size: 150,
        cell: ({ row }) => {
          const original = row.original;
          const id = original.id;
          if (!id) return null;

          const isSettled = original.settled ?? original._isSettled;
          const resolvedToYes = original.resolvedToYes;

          if (isSettled) {
            return (
              <div className="flex items-center gap-2 justify-end">
                <Badge variant={resolvedToYes ? 'default' : 'destructive'}>
                  Resolved: {resolvedToYes ? 'YES' : 'NO'}
                </Badge>
              </div>
            );
          }

          return (
            <div className="flex items-center gap-2">
              <ResolveConditionCell
                marketId={id as `0x${string}`}
                endTime={original.endTime}
                claim={original.claimStatement}
                assertionId={original.assertionId}
                assertionTimestamp={original.assertionTimestamp}
                resolver={original.resolver ?? null}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingId(id);
                  setEditingChainId(original.chainId ?? DEFAULT_CHAIN_ID);
                  setQuestion(original.question || '');
                  setShortName(original.shortName || '');
                  setCategorySlug(original.category?.slug || '');
                  setEndTime(original.endTime ?? 0);
                  setIsPublic(Boolean(original.public));
                  setClaimStatement(original.claimStatement || '');
                  setDescription(original.description || '');
                  setSimilarMarketsText(
                    (original.similarMarketUrls || []).join(', ')
                  );
                  setGroupName(original.conditionGroup?.name || '');
                  setResolver(original.resolver || '');
                  setCreateOpen(true);
                }}
              >
                Edit
              </Button>
            </div>
          );
        },
      },
    ],
    [toast]
  );

  const rows: RFQRow[] = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);

    const mapped = (conditions || []).map((c, index) => {
      // Try to get settlement status from DB first (new method)
      let isSettled = c.settled;
      let resolvedToYes = c.resolvedToYes;

      // Fallback to contract read if not settled in DB (old method/transition)
      if (!isSettled) {
        const settlementResult = settlementData?.[index];
        if (settlementResult?.status === 'success') {
          isSettled = Boolean(settlementResult.result?.[2]);
          if (isSettled) {
            resolvedToYes = Boolean(settlementResult.result?.[3]);
          }
        }
      }

      const hasData =
        c.settled || settlementData?.[index]?.status === 'success';

      return {
        id: c.id,
        question: c.question,
        shortName: c.shortName,
        category: c.category || undefined,
        conditionGroup: c.conditionGroup || undefined,
        endTime: c.endTime,
        public: c.public,
        claimStatement: c.claimStatement,
        description: c.description,
        similarMarketUrls: c.similarMarkets,
        chainId: c.chainId,
        resolver: c.resolver ?? null,
        resolvedToYes,
        assertionId: c.assertionId,
        assertionTimestamp: c.assertionTimestamp,
        _isSettled: isSettled,
        _hasData: hasData,
      };
    });

    // Filter based on selected filter
    const filtered = mapped.filter((row) => {
      let passesSettlementFilter = true;
      if (filter !== 'all') {
        const isPastEnd = !!(row.endTime && row.endTime <= now);
        const isUpcoming = !!(row.endTime && row.endTime > now);

        if (filter === 'needs-settlement') {
          passesSettlementFilter = isPastEnd && !row._isSettled;
        } else if (filter === 'upcoming') {
          passesSettlementFilter = isUpcoming;
        } else if (filter === 'settled') {
          passesSettlementFilter = row._isSettled === true;
        }
      }

      let passesCategoryFilter = true;
      if (categoryFilter !== 'all') {
        passesCategoryFilter = row.category?.slug === categoryFilter;
      }

      return passesSettlementFilter && passesCategoryFilter;
    });

    return filtered;
  }, [conditions, filter, categoryFilter, settlementData]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const similarMarkets = similarMarketsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const trimmedGroupName = groupName.trim();
      if (editingId) {
        const body = {
          question,
          ...(shortName ? { shortName } : {}),
          ...(categorySlug ? { categorySlug } : {}),
          public: isPublic,
          description,
          similarMarkets,
          // Only send groupName if non-empty (empty means "leave unchanged")
          ...(trimmedGroupName ? { groupName: trimmedGroupName } : {}),
        };
        await putJson<RFQRow>(`/conditions/${editingId}`, body);
        await refetch();
        toast({ title: 'Saved', description: 'Condition updated' });
        setCreateOpen(false);
        resetForm();
      } else {
        if (!resolver?.trim()) {
          toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Resolver address is required',
          });
          return;
        }
        const trimmedResolver = resolver.trim();
        if (!isAddress(trimmedResolver as `0x${string}`)) {
          toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Resolver must be a valid Ethereum address (0x...)',
          });
          return;
        }
        const body = {
          question,
          ...(shortName ? { shortName } : {}),
          ...(categorySlug ? { categorySlug } : {}),
          endTime: endTime,
          public: isPublic,
          claimStatement,
          description,
          similarMarkets,
          chainId: protocolVersion === 'v2' ? v2ChainId : currentChainId,
          resolver: trimmedResolver.toLowerCase(),
          ...(trimmedGroupName ? { groupName: trimmedGroupName } : {}),
          // V2: pass condition ID directly via conditionHash
          ...(protocolVersion === 'v2' && v2ConditionId
            ? { conditionHash: v2ConditionId }
            : {}),
        };
        await postJson<RFQRow>(`/conditions`, body);
        // Refresh list to reflect server state and close the modal
        await refetch();
        toast({ title: 'Created', description: 'Condition created' });
        setCreateOpen(false);
        resetForm();
      }
    } catch (e) {
      toast({
        variant: 'destructive',
        title: editingId
          ? 'Error updating condition'
          : 'Error creating condition',
        description: (e as Error)?.message || 'Request failed',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter and Import Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Settlement:</span>
          <Select
            value={filter}
            onValueChange={(value) => setFilter(value as ConditionFilter)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Show All</SelectItem>
              <SelectItem value="needs-settlement">Needs Settlement</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-sm font-medium">Category:</span>
          <Select
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-sm font-medium">Visibility:</span>
          <Select
            value={visibilityFilter}
            onValueChange={(value) =>
              setVisibilityFilter(value as VisibilityFilter)
            }
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="public">Public Only</SelectItem>
              <SelectItem value="private">Private Only</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-sm font-medium">Chain:</span>
          <Select value={chainFilter} onValueChange={setChainFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Chains</SelectItem>
              <SelectItem value="5064014">Ethereal</SelectItem>
              <SelectItem value="13374202">Ethereal Testnet</SelectItem>
              <SelectItem value="42161">Arbitrum</SelectItem>
            </SelectContent>
          </Select>

          {(filter !== 'all' ||
            categoryFilter !== 'all' ||
            visibilityFilter !== 'all' ||
            chainFilter !== 'all') && (
            <span className="text-sm text-muted-foreground">
              ({rows.length} {rows.length === 1 ? 'condition' : 'conditions'})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* CSV Import Button (only when uncontrolled) */}
          {onCsvImportOpenChange ? null : (
            <Button
              onClick={() => setCsvImportOpen(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
          )}
          {/* External action buttons */}
          {actionButtons}
        </div>
      </div>

      {/* CSV Import Dialog */}
      <Dialog open={csvImportOpen} onOpenChange={setCsvImportOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Import Conditions from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import conditions. The file should have
              the following columns:
              <code className="block mt-2 p-2 bg-muted rounded text-sm">
                question,categorySlug,endTimeUTC,public,claimStatement,description,shortName,similarMarkets,group,resolver
              </code>
              <span className="block mt-1 text-xs">
                group is optional - finds or creates a condition group by name.
                resolver is required - must be a valid Ethereum address (0x...)
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">CSV File</label>
              <Input
                type="file"
                accept=".csv"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                disabled={isImporting}
              />
            </div>

            {/* Validation Results */}
            {validatedRows.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Preview & Validation</h3>
                  <div className="flex gap-2">
                    <Badge variant="secondary">
                      {validatedRows.filter((r) => r.isValid).length} Valid
                    </Badge>
                    <Badge variant="destructive">
                      {validatedRows.filter((r) => !r.isValid).length} Invalid
                    </Badge>
                  </div>
                </div>

                {/* Preview Table */}
                <div className="border rounded-md max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left whitespace-nowrap">Row</th>
                        <th className="p-2 text-left whitespace-nowrap">
                          Question
                        </th>
                        <th className="p-2 text-left whitespace-nowrap">
                          Group
                        </th>
                        <th className="p-2 text-left whitespace-nowrap">
                          Status
                        </th>
                        <th className="p-2 text-left whitespace-nowrap">
                          Errors
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {validatedRows.map((row) => (
                        <tr key={row.rowIndex} className="border-t">
                          <td className="p-2 font-mono">{row.rowIndex}</td>
                          <td className="p-2 max-w-xs truncate">
                            {row.question}
                          </td>
                          <td className="p-2 max-w-xs truncate text-muted-foreground">
                            {row.parsedGroup || '—'}
                          </td>
                          <td className="p-2">
                            {row.isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                          </td>
                          <td className="p-2 max-w-xs">
                            {row.errors.length > 0 && (
                              <div className="text-red-600 text-xs">
                                {row.errors.join(', ')}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Import Progress */}
                {isImporting && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Importing...</span>
                      <span>{Math.round(importProgress)}%</span>
                    </div>
                    <Progress value={importProgress} />
                  </div>
                )}

                {/* Import Results */}
                {importResults && (
                  <div className="space-y-2 p-4 bg-muted/50 rounded-md">
                    <h4 className="font-medium">Import Results</h4>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-600">
                        ✓ {importResults.success} successful
                      </span>
                      <span className="text-red-600">
                        ✗ {importResults.failed} failed
                      </span>
                    </div>
                    {importResults.errors.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-red-600">
                          Show errors ({importResults.errors.length})
                        </summary>
                        <div className="mt-2 max-h-32 overflow-y-auto">
                          {importResults.errors.map((error, index) => (
                            <div
                              key={index}
                              className="text-xs text-red-600 mb-1"
                            >
                              {error}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={resetCsvImport}
                    disabled={isImporting}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={
                      validatedRows.filter((r) => r.isValid).length === 0 ||
                      isImporting
                    }
                  >
                    {isImporting
                      ? 'Importing...'
                      : `Import ${validatedRows.filter((r) => r.isValid).length} Valid Rows`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Condition' : 'Create Condition'}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={onSubmit}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            {/* Protocol Version Toggle */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Protocol Version</label>
              <Select
                value={protocolVersion}
                onValueChange={(v) => {
                  setProtocolVersion(v as 'v1' | 'v2');
                  // Auto-populate resolver address when switching to V2
                  if (v === 'v2') {
                    const addr = getV2ResolverAddress(
                      v2ResolverType,
                      v2ChainId
                    );
                    if (addr) setResolver(addr);
                  } else {
                    setResolver('');
                  }
                }}
                disabled={Boolean(editingId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v1">V1 (Legacy)</SelectItem>
                  <SelectItem value="v2">V2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Question</label>
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Short Name (optional)
              </label>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select value={categorySlug} onValueChange={setCategorySlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Chain</label>
              {protocolVersion === 'v2' && !editingId ? (
                <Select
                  value={String(v2ChainId)}
                  onValueChange={(v) => {
                    setV2ChainId(Number(v));
                    // Re-populate resolver address
                    const addr = getV2ResolverAddress(
                      v2ResolverType,
                      Number(v)
                    );
                    if (addr) setResolver(addr);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5064014">Ethereal</SelectItem>
                    <SelectItem value="13374202">Ethereal Testnet</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={
                    editingId
                      ? editingChainId === CHAIN_ID_ETHEREAL
                        ? 'Ethereal'
                        : 'Arbitrum'
                      : currentChainName
                  }
                  disabled
                  readOnly
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Time (UTC)</label>
              <DateTimePicker
                value={endTime}
                onChange={setEndTime}
                min={Math.floor(Date.now() / 1000)}
                disabled={Boolean(editingId)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Public</label>
              <div className="flex items-center h-10">
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Claim Statement</label>
              <Input
                value={claimStatement}
                onChange={(e) => setClaimStatement(e.target.value)}
                required
                disabled={Boolean(editingId)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Description / Rules</label>
              <Textarea
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDescription(e.target.value)
                }
                rows={5}
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">
                Similar Markets (comma-separated URLs)
              </label>
              <Input
                placeholder="https://..., https://..."
                value={similarMarketsText}
                onChange={(e) => setSimilarMarketsText(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Group (optional)</label>
              <Input
                placeholder="Group name (finds or creates a condition group)"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            {/* V2-specific fields */}
            {protocolVersion === 'v2' && !editingId && (
              <>
                {/* Resolver Type - 4 options */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Resolver Type</label>
                  <Select
                    value={v2ResolverType}
                    onValueChange={(v) => {
                      setV2ResolverType(
                        v as 'manual' | 'pyth' | 'uma-lz' | 'conditional-tokens'
                      );
                      const addr = getV2ResolverAddress(
                        v as keyof typeof V2_RESOLVER_MAP,
                        v2ChainId
                      );
                      if (addr) setResolver(addr);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Resolver</SelectItem>
                      <SelectItem value="pyth">Pyth Resolver</SelectItem>
                      <SelectItem value="uma-lz">UMA-LZ Resolver</SelectItem>
                      <SelectItem value="conditional-tokens">
                        Conditional Tokens Resolver
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Condition ID */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Condition ID{' '}
                    <span className="text-muted-foreground font-normal">
                      (optional - auto-generated if empty)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="0x..."
                      value={v2ConditionId}
                      onChange={(e) => setV2ConditionId(e.target.value)}
                      className="font-mono flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const uniqueData = `${claimStatement}:${endTime}:${Date.now()}`;
                        const hash = keccak256(toHex(uniqueData));
                        setV2ConditionId(hash);
                      }}
                    >
                      Generate
                    </Button>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">
                Resolver Address{' '}
                {!editingId && <span className="text-red-500">*</span>}
              </label>
              <Input
                placeholder="0x..."
                value={resolver}
                onChange={(e) => setResolver(e.target.value)}
                required={!editingId}
                disabled={Boolean(editingId) || protocolVersion === 'v2'}
                className="font-mono"
              />
              {editingId && (
                <p className="text-xs text-muted-foreground">
                  Resolver cannot be changed after creation
                </p>
              )}
              {protocolVersion === 'v2' && !editingId && (
                <p className="text-xs text-muted-foreground">
                  Auto-populated from resolver type and chain
                </p>
              )}
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">{editingId ? 'Save' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div>
        <DataTable columns={columns} data={rows} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        ) : null}
      </div>
    </div>
  );
};

export default RFQTab;
