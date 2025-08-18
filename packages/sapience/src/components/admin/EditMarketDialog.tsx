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
import { Switch } from '@sapience/ui/components/ui/switch';
import { Label } from '@sapience/ui/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSignMessage } from 'wagmi';

import type { MarketType } from '@sapience/ui/types';
import MarketFormFields, { type MarketInput } from './MarketFormFields';
import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { tickToPrice } from '~/lib/utils/tickUtils';
import { sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';

const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL || '/api';

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
  };
};

const EditMarketDialog = ({ group, market }: Props) => {
  const [open, setOpen] = useState(false);
  const [formMarket, setFormMarket] = useState<MarketInput>(
    toMarketInput(market)
  );
  const [isPublic, setIsPublic] = useState<boolean>(market.public ?? true);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { signMessageAsync } = useSignMessage();

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

  const handleChange = (field: keyof MarketInput, value: string) => {
    setFormMarket((prev) => ({ ...prev, [field]: value }));
  };

  const updateCall = async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signMessageAsync({
      message: ADMIN_AUTHENTICATE_MSG,
    });

    const payloadData: Record<string, unknown> = {};
    // Always mappable fields
    payloadData.question = formMarket.marketQuestion;
    payloadData.optionName = formMarket.optionName;
    payloadData.public = isPublic;

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

    const url = `${API_BASE_URL}/marketGroups/${group.address}/markets/${
      market.marketId || market.id
    }`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: group.chainId,
        data: payloadData,
        signature,
        timestamp,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to update market');
    }
    return data;
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
        queryKey: ['marketGroup', group.address, group.chainId],
      });
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
      <DialogContent className="sm:max-w-[700px] overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Market #{market.marketId || market.id}</DialogTitle>
        </DialogHeader>
        <div className="p-2">
          <div className="mb-4 flex items-center gap-2">
            <Switch
              id="public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
            <Label htmlFor="public" className="cursor-pointer">
              Public
            </Label>
          </div>
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
