'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { MarketType } from '@sapience/ui/types';
import MarketFormFields, { type MarketInput } from './MarketFormFields';
import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { tickToPrice } from '~/lib/utils/tickUtils';
import { sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';
import { useAdminApi } from '~/hooks/useAdminApi';

type Props = {
  group: EnrichedMarketGroup;
  market: MarketType;
};

const toMarketInput = (m: MarketType): MarketInput => {
  const startTs = m.startTimestamp ? Number(m.startTimestamp) : 0;
  const endTs = m.endTimestamp ? Number(m.endTimestamp) : 0;
  const lowPrice = m.baseAssetMinPriceTick
    ? tickToPrice(Number(m.baseAssetMinPriceTick))
    : 0.00009908435194807992;
  const highPrice = m.baseAssetMaxPriceTick
    ? tickToPrice(Number(m.baseAssetMaxPriceTick))
    : 1;
  const startPrice = m.startingSqrtPriceX96
    ? (
        Number(sqrtPriceX96ToPriceD18(BigInt(m.startingSqrtPriceX96))) /
        10 ** 18
      ).toString()
    : '0.5';
  return {
    id: Date.now(),
    marketQuestion: m.question || '',
    optionName: m.optionName || '',
    startTime: startTs ? String(startTs) : '',
    endTime: endTs ? String(endTs) : '',
    startingPrice: startPrice,
    lowTickPrice: String(lowPrice),
    highTickPrice: String(highPrice),
    startingSqrtPriceX96: m.startingSqrtPriceX96 || '0',
    baseAssetMinPriceTick: String(m.baseAssetMinPriceTick ?? ''),
    baseAssetMaxPriceTick: String(m.baseAssetMaxPriceTick ?? ''),
    claimStatementYesOrNumeric: m.claimStatementYesOrNumeric || '',
    claimStatementNo: m.claimStatementNo || '',
    public: m.public ?? true,
  };
};

const EditMarketDialog = ({ group, market }: Props) => {
  const [open, setOpen] = useState(false);
  const [formMarket, setFormMarket] = useState<MarketInput>(
    toMarketInput(market)
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { putJson } = useAdminApi();

  const isDeployed = Boolean(market.poolAddress);

  const disabledFields = useMemo(() => {
    if (!isDeployed) return undefined;
    return {
      claimStatementYesOrNumeric: true,
      claimStatementNo: true,
      startTime: true,
      endTime: true,
      baseAssetMinPriceTick: true,
      baseAssetMaxPriceTick: true,
      startingSqrtPriceX96: true,
    } as const;
  }, [isDeployed]);

  const handleChange = (
    field: keyof MarketInput,
    value: string | boolean | string[]
  ) => {
    setFormMarket((prev) => ({ ...prev, [field]: value as any }));
  };

  const updateCall = async () => {
    const payloadData: Record<string, unknown> = {};
    // Always mappable fields
    payloadData.question = formMarket.marketQuestion;
    payloadData.optionName = formMarket.optionName;
    payloadData.public = formMarket.public;

    if (!isDeployed) {
      // Only include pre-deploy updateables
      if (formMarket.claimStatementYesOrNumeric)
        payloadData.claimStatementYesOrNumeric =
          formMarket.claimStatementYesOrNumeric;
      payloadData.claimStatementNo = formMarket.claimStatementNo || '';
      if (formMarket.startTime)
        payloadData.startTime = Number(formMarket.startTime);
      if (formMarket.endTime) payloadData.endTime = Number(formMarket.endTime);
      if (formMarket.startingSqrtPriceX96)
        payloadData.startingSqrtPriceX96 = formMarket.startingSqrtPriceX96;
      if (formMarket.baseAssetMinPriceTick)
        payloadData.baseAssetMinPriceTick = Number(
          formMarket.baseAssetMinPriceTick
        );
      if (formMarket.baseAssetMaxPriceTick)
        payloadData.baseAssetMaxPriceTick = Number(
          formMarket.baseAssetMaxPriceTick
        );
    }

    const path = group.address
      ? `/marketGroups/${group.address}/markets/${market.marketId || market.id}`
      : `/marketGroups/by-id/${group.id}/markets/${market.id}`;
    const body = group.address
      ? { chainId: group.chainId, data: payloadData }
      : { data: payloadData };
    return putJson(path, body as any);
  };

  const { mutate, isPending } = useMutation({
    mutationFn: updateCall,
    onSuccess: async () => {
      toast({
        title: 'Market Updated',
        description: 'Changes saved successfully.',
      });
      await queryClient.invalidateQueries({ queryKey: ['marketGroups'] });
      await queryClient.invalidateQueries({
        queryKey: ['enrichedMarketGroups'],
      });
      if (group.address) {
        await queryClient.invalidateQueries({
          queryKey: ['marketGroup', group.address, group.chainId],
        });
      }
      setOpen(false);
    },
    onError: (e: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: e?.message || 'Unknown error',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] overflow-visible max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Market #{market.marketId || market.id}</DialogTitle>
        </DialogHeader>
        <div className="p-2 overflow-y-auto max-h-[calc(90vh-120px)]">
          <MarketFormFields
            market={formMarket}
            onMarketChange={handleChange}
            disabledFields={disabledFields}
          />
          <Button
            onClick={() => mutate()}
            disabled={isPending}
            className="w-full mt-4"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditMarketDialog;
