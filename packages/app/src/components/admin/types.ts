import type { Market } from '~/lib/context/MarketListProvider';

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
  market: Market;
  loading: boolean;
  onUpdate: (market: Market) => void;
}

export interface BondCellProps {
  market: Market;
  epoch: any;
  bondAmount?: bigint;
  bondCurrency?: string;
  vaultAddress?: string;
}

export interface SettlementPriceCellProps {
  market: Market;
  epoch: any;
}

export interface EpochItemProps {
  epoch: Market['epochs'][0];
  market: Market;
  missingBlocks: MissingBlocks;
}
