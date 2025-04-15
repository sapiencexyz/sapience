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
  market: MarketGroup;
  epochId: number;
  onUpdate: (market: MarketGroup, epochId: number) => void;
}

export interface BondCellProps {
  market: MarketGroup;
  epoch: any;
  bondAmount?: bigint;
  bondCurrency?: string;
  vaultAddress?: string;
}

export interface SettlementPriceCellProps {
  market: MarketGroup;
  epoch: any;
}

export interface EpochItemProps {
  epoch: MarketGroup['epochs'][0];
  market: MarketGroup;
  missingBlocks: MissingBlocks;
}
