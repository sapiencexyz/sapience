'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Label } from '@sapience/ui';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@sapience/ui/components/ui/alert';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { FileText, Upload } from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';

import {
  DEFAULT_FACTORY_ADDRESS,
  DEFAULT_CHAIN_ID,
  DEFAULT_OWNER,
  DEFAULT_BOND_CURRENCY,
  DEFAULT_COLLATERAL_ASSET,
  DEFAULT_OPTIMISTIC_ORACLE,
  DEFAULT_UNISWAP_POS_MANAGER,
  DEFAULT_UNISWAP_SWAP_ROUTER,
  DEFAULT_UNISWAP_QUOTER,
  DEFAULT_FEE_RATE,
  DEFAULT_ASSERTION_LIVENESS,
  DEFAULT_BOND_AMOUNT,
  DEFAULT_MIN_TRADE_SIZE,
  DEFAULT_SQRT_PRICE,
  DEFAULT_MIN_PRICE_TICK,
  DEFAULT_MAX_PRICE_TICK,
  DEFAULT_BASE_TOKEN_NAME,
  DEFAULT_QUOTE_TOKEN_NAME,
} from './CreateMarketGroupForm';
import { parseCsv, mapCsv } from '~/lib/utils/csv';
import { useAdminApi } from '~/hooks/useAdminApi';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
// Defaults are imported from CreateMarketGroupForm to ensure consistency across admin surfaces

type CsvRow = Record<string, string>;

type GroupKey = string;

type Grouped = {
  key: GroupKey;
  rows: CsvRow[];
  errors: string[];
};

type ImportResult = {
  groupKey: string;
  success: boolean;
  error?: string;
};

const requiredString = (obj: CsvRow, key: string, errors: string[]) => {
  const v = (obj[key] ?? '').trim();
  if (!v) errors.push(`Missing required column: ${key}`);
  return v;
};

const CLCsvImportDialog = ({ open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const { postJson } = useAdminApi();
  const { address: connectedAddress } = useAccount();
  const currentChainId = useChainId();

  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [grouped, setGrouped] = useState<Grouped[]>([]);
  const [validated, setValidated] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const categoryIds = useMemo(() => new Set(FOCUS_AREAS.map((a) => a.id)), []);

  useEffect(() => {
    if (!open) {
      setCsvErrors([]);
      setRows([]);
      setGrouped([]);
      setValidated(false);
      setIsImporting(false);
      setProgress(0);
      setResults(null);
    }
  }, [open]);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const { headers, rows, errors } = parseCsv(text, ',');
      const objects = mapCsv(headers, rows);
      setRows(objects);
      setCsvErrors(errors);
      setValidated(false);
      setResults(null);
      toast({
        title: 'CSV loaded',
        description: `${objects.length} rows parsed`,
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Read error',
        description: (e as Error)?.message || 'Failed to read CSV',
      });
    }
  };

  const validateAndGroup = () => {
    // Block validation if CSV parse errors are present
    if (csvErrors.length > 0) {
      toast({
        variant: 'destructive',
        title: 'CSV errors detected',
        description: 'Please fix CSV parsing errors before validating.',
      });
      return;
    }
    const groupsMap = new Map<GroupKey, Grouped>();
    rows.forEach((row, idx) => {
      const rowErrors: string[] = [];
      const groupKey = requiredString(row, 'groupKey', rowErrors);
      requiredString(row, 'groupQuestion', rowErrors);
      requiredString(row, 'rules', rowErrors);
      const categorySlug = requiredString(row, 'categorySlug', rowErrors);
      if (categorySlug && !categoryIds.has(categorySlug)) {
        rowErrors.push(`Unknown categorySlug '${categorySlug}'`);
      }
      requiredString(row, 'marketQuestion', rowErrors);
      requiredString(row, 'claimStatementYesOrNumeric', rowErrors);
      const claimNoCsv = (row['claimStatementNo'] ?? '').trim();
      if (!claimNoCsv) {
        rowErrors.push('Missing required column: claimStatementNo');
      }
      const endTime = requiredString(row, 'endTime', rowErrors);
      if (endTime) {
        const nowSec = Math.floor(Date.now() / 1000);
        const e = Number(endTime);
        if (!(Number.isFinite(e) && e > nowSec)) {
          rowErrors.push('endTime must be greater than current time');
        }
      }

      // Pricing is not supplied via CSV; defaults will be used

      const groupedEntry = groupsMap.get(groupKey) || {
        key: groupKey,
        rows: [],
        errors: [],
      };
      groupedEntry.rows.push(row);
      groupedEntry.errors.push(...rowErrors.map((e) => `Row ${idx + 2}: ${e}`));
      groupsMap.set(groupKey, groupedEntry);
    });

    const groups = Array.from(groupsMap.values());

    // Per-group consistency checks
    groups.forEach((g) => {
      if (g.rows.length === 0) return;
      const first = g.rows[0];
      const fieldsToMatch = ['groupQuestion', 'rules', 'categorySlug'];
      for (const r of g.rows) {
        fieldsToMatch.forEach((f) => {
          if ((first[f] ?? '').trim() !== (r[f] ?? '').trim()) {
            g.errors.push(
              `Group '${g.key}': field '${f}' differs between rows`
            );
          }
        });
      }
    });

    setGrouped(groups);
    setValidated(true);
  };

  const importGroups = async () => {
    if (!validated || grouped.length === 0) return;
    setIsImporting(true);
    setResults([]);
    try {
      const res: ImportResult[] = [];
      let completed = 0;
      const total = grouped.length;

      for (const g of grouped) {
        try {
          if (g.errors.length > 0) throw new Error(g.errors.join('; '));
          const first = g.rows[0];

          // Defaults injection
          const owner =
            !connectedAddress || currentChainId === DEFAULT_CHAIN_ID
              ? DEFAULT_OWNER
              : connectedAddress;
          const chainId = String(DEFAULT_CHAIN_ID);
          const factoryAddress = DEFAULT_FACTORY_ADDRESS;
          const collateralAsset = DEFAULT_COLLATERAL_ASSET;
          const minTradeSize = DEFAULT_MIN_TRADE_SIZE;
          const nonce = Math.floor(Math.random() * 1e18).toString();
          const marketParams = {
            feeRate: DEFAULT_FEE_RATE,
            assertionLiveness: DEFAULT_ASSERTION_LIVENESS,
            bondAmount: DEFAULT_BOND_AMOUNT,
            bondCurrency: DEFAULT_BOND_CURRENCY,
            uniswapPositionManager: DEFAULT_UNISWAP_POS_MANAGER,
            uniswapSwapRouter: DEFAULT_UNISWAP_SWAP_ROUTER,
            uniswapQuoter: DEFAULT_UNISWAP_QUOTER,
            optimisticOracleV3: DEFAULT_OPTIMISTIC_ORACLE,
          };

          const question = (first['groupQuestion'] ?? '').trim();
          const rules = (first['rules'] ?? '').trim();
          const category = (first['categorySlug'] ?? '').trim();
          const baseTokenName = DEFAULT_BASE_TOKEN_NAME;
          const quoteTokenName = DEFAULT_QUOTE_TOKEN_NAME;

          const nowSec = Math.floor(Date.now() / 1000);
          const markets = g.rows.map((r) => {
            const similarRaw = (r['similarMarkets'] ?? '').trim();
            const similar = similarRaw
              ? similarRaw
                  .split(';')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined;
            const claimNoCsv = (r['claimStatementNo'] ?? '').trim();

            return {
              marketQuestion: (r['marketQuestion'] ?? '').trim(),
              optionName: (r['optionName'] ?? '').trim() || undefined,
              claimStatementYesOrNumeric: (
                r['claimStatementYesOrNumeric'] ?? ''
              ).trim(),
              claimStatementNo: claimNoCsv || undefined,
              startTime: String(nowSec),
              endTime: (r['endTime'] ?? '').trim(),
              // Pricing defaults
              startingSqrtPriceX96: DEFAULT_SQRT_PRICE,
              baseAssetMinPriceTick: DEFAULT_MIN_PRICE_TICK,
              baseAssetMaxPriceTick: DEFAULT_MAX_PRICE_TICK,
              public: false,
              similarMarkets: similar,
              // UI-only fields (startingPrice, lowTickPrice, highTickPrice) are omitted from payload
            } as const;
          });

          const payload = {
            chainId,
            owner,
            collateralAsset,
            minTradeSize,
            marketParams,
            nonce,
            question,
            rules: rules || undefined,
            category,
            factoryAddress,
            baseTokenName,
            quoteTokenName,
            resourceId: undefined,
            isBridged: false,
            markets,
          };

          await postJson('/marketGroups', payload);
          res.push({ groupKey: g.key, success: true });
        } catch (err) {
          res.push({
            groupKey: g.key,
            success: false,
            error: (err as Error)?.message || 'Unknown error',
          });
        }
        completed++;
        setProgress(Math.round((completed / total) * 100));
      }

      setResults(res);
      const ok = res.filter((r) => r.success).length;
      const bad = res.length - ok;
      toast({
        title: 'Import finished',
        description: `${ok} groups created, ${bad} failed`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Import Markets from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV to create multiple Market Groups in one go. Use{' '}
            <span className="font-mono">groupKey</span> to group rows; rows with
            the same key become one group. The key is only used during this
            import and is not saved. All advanced parameters (including pricing)
            use defaults and are not accepted in the CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>CSV File</Label>
            <Input
              type="file"
              accept=".csv"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {csvErrors.length > 0 ? (
              <Alert variant="destructive">
                <AlertTitle>Parsing Warnings</AlertTitle>
                <AlertDescription>{csvErrors.join(', ')}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="text-sm">
            <div className="font-medium mb-1">Required columns</div>
            <code className="block p-2 bg-muted rounded">
              groupKey, groupQuestion, categorySlug, marketQuestion, rules,
              claimStatementYesOrNumeric, claimStatementNo, endTime
            </code>
          </div>
          <div className="text-sm">
            <div className="font-medium mb-1">Optional columns</div>
            <code className="block p-2 bg-muted rounded">
              optionName, similarMarkets
            </code>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={validateAndGroup}
              disabled={
                rows.length === 0 || isImporting || csvErrors.length > 0
              }
            >
              Validate
            </Button>
            <Button
              onClick={importGroups}
              disabled={
                !validated ||
                grouped.length === 0 ||
                isImporting ||
                csvErrors.length > 0
              }
            >
              {isImporting ? (
                <span className="flex items-center gap-2">
                  <Upload className="h-4 w-4 animate-pulse" /> Importing...{' '}
                  {progress}%
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload className="h-4 w-4" /> Import
                </span>
              )}
            </Button>
          </div>

          {/* Preview */}
          {validated ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {grouped.length} groups detected
              </div>
              <div className="space-y-3">
                {grouped.map((g) => (
                  <div key={g.key} className="border rounded p-3">
                    <div className="font-medium mb-1">Group: {g.key}</div>
                    {g.errors.length > 0 ? (
                      <div className="text-xs text-red-500">
                        {g.errors.join('; ')}
                      </div>
                    ) : (
                      <div className="text-xs text-green-600">OK</div>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {g.rows.length} markets
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Results */}
          {results ? (
            <div className="space-y-2">
              <div className="font-medium">Results</div>
              <div className="space-y-2">
                {results.map((r) => (
                  <div
                    key={r.groupKey}
                    className={`text-sm ${r.success ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {r.groupKey}:{' '}
                    {r.success ? 'created' : `failed — ${r.error}`}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CLCsvImportDialog;
