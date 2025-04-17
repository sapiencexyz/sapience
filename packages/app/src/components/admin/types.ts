import type { MarketGroup } from '~/lib/context/FoilProvider';

export interface MissingBlocks {
  [key: string]: {
    resourcePrice?: number[];
  };
}

export interface AddressCellProps {
  address: string;
  chainId: number;
}

export interface PublicCellProps {
  isPublic: boolean;
  loading: boolean;
  marketGroup: MarketGroup;
  marketId: number;
  onUpdate: (marketGroup: MarketGroup, marketId: number) => void;
}

export interface BondCellProps {
  marketGroup: MarketGroup;
  market: any;
  bondAmount?: bigint;
  bondCurrency?: string;
  vaultAddress?: string;
}

export interface SettlementPriceCellProps {
  marketGroup: MarketGroup;
  market: any;
}

export interface MarketItemProps {
  market: MarketGroup['markets'][0];
  marketGroup: MarketGroup;
  missingBlocks: MissingBlocks;
}
