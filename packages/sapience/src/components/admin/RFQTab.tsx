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
import { useReadContract } from 'wagmi';
import { keccak256, concatHex, toHex } from 'viem';
import DateTimePicker from '../shared/DateTimePicker';
import DataTable from './data-table';
import ResolveConditionCell from './ResolveConditionCell';
import { parseCsv, mapCsv } from '~/lib/utils/csv';
import { useAdminApi } from '~/hooks/useAdminApi';
import { useCategories } from '~/hooks/graphql/useMarketGroups';
import { useConditions } from '~/hooks/graphql/useConditions';

type RFQRow = {
  id?: string;
  question: string;
  shortName?: string | null;
  category?: { id?: number; name?: string; slug?: string };
  endTime?: number;
  public?: boolean;
  claimStatement: string;
  description: string;
  similarMarketUrls?: string[];
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
};

type ValidatedCSVRow = CSVRow & {
  rowIndex: number;
  isValid: boolean;
  errors: string[];
  parsedEndTime?: number;
  parsedPublic?: boolean;
  parsedSimilarMarkets?: string[];
};

type RFQTabProps = {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  // Optional external control for CSV Import dialog
  csvImportOpen?: boolean;
  onCsvImportOpenChange?: (open: boolean) => void;
};

const RFQTab = ({
  createOpen,
  setCreateOpen,
  csvImportOpen: csvImportOpenProp,
  onCsvImportOpenChange,
}: RFQTabProps) => {
  const { toast } = useToast();
  const { postJson, putJson } = useAdminApi();
  const { data: categories } = useCategories();
  const { data: conditions, isLoading, refetch } = useConditions({ take: 200 });

  const [question, setQuestion] = useState('');
  const [shortName, setShortName] = useState('');
  const [categorySlug, setCategorySlug] = useState<string>('');
  const [endTime, setEndTime] = useState<number>(0);
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [claimStatement, setClaimStatement] = useState('');
  const [description, setDescription] = useState('');
  const [similarMarketsText, setSimilarMarketsText] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

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
    setEditingId(undefined);
  };

  // CSV Import helper functions
  const validateCSVRow = (row: CSVRow, rowIndex: number): ValidatedCSVRow => {
    const errors: string[] = [];
    let parsedEndTime: number | undefined;
    let parsedPublic: boolean | undefined;
    let parsedSimilarMarkets: string[] | undefined;

    // Validate required fields
    if (!row.question?.trim()) errors.push('Question is required');
    if (!row.endTimeUTC?.trim()) errors.push('End time is required');
    if (!row.claimStatement?.trim()) errors.push('Claim statement is required');
    if (!row.description?.trim()) errors.push('Description is required');

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

    return {
      ...row,
      rowIndex,
      isValid: errors.length === 0,
      errors,
      parsedEndTime,
      parsedPublic,
      parsedSimilarMarkets,
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

  // UMA Resolver config (same as used elsewhere in admin)
  const UMA_CHAIN_ID = 42161;
  const UMA_RESOLVER_ADDRESS =
    '0x9052992cB14b7af25a3c40B27211d369c9ff7758' as `0x${string}`;

  // Minimal ABI to read wrapped market status
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

  function ConditionStatusBadges({
    claimStatement,
    endTime,
  }: {
    claimStatement?: string;
    endTime?: number;
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

    const { data } = useReadContract({
      address: UMA_RESOLVER_ADDRESS,
      abi: umaWrappedMarketAbi,
      functionName: 'wrappedMarkets',
      args: marketId ? [marketId] : undefined,
      chainId: UMA_CHAIN_ID,
      query: { enabled: Boolean(marketId) },
    });

    const tuple = data;
    const settled = Boolean(tuple?.[2] ?? false);

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
          return (
            <div className="flex items-center gap-2">
              <ResolveConditionCell
                marketId={id as `0x${string}`}
                endTime={original.endTime}
                claim={original.claimStatement}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingId(id);
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
    return (conditions || []).map((c) => ({
      id: c.id,
      question: c.question,
      shortName: c.shortName,
      category: c.category || undefined,
      endTime: c.endTime,
      public: c.public,
      claimStatement: c.claimStatement,
      description: c.description,
      similarMarketUrls: c.similarMarkets,
    }));
  }, [conditions]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const similarMarkets = similarMarketsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (editingId) {
        const body = {
          question,
          ...(shortName ? { shortName } : {}),
          ...(categorySlug ? { categorySlug } : {}),
          public: isPublic,
          description,
          similarMarkets,
        };
        await putJson<RFQRow>(`/conditions/${editingId}`, body);
        await refetch();
        toast({ title: 'Saved', description: 'Condition updated' });
        setCreateOpen(false);
        resetForm();
      } else {
        const body = {
          question,
          ...(shortName ? { shortName } : {}),
          ...(categorySlug ? { categorySlug } : {}),
          endTime: endTime,
          public: isPublic,
          claimStatement,
          description,
          similarMarkets,
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
    <div>
      {/* CSV Import Button (only when uncontrolled) */}
      {onCsvImportOpenChange ? null : (
        <div className="flex justify-end">
          <Button
            onClick={() => setCsvImportOpen(true)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        </div>
      )}

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
                question,categorySlug,endTimeUTC,public,claimStatement,description,shortName,similarMarkets
              </code>
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
