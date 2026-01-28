import type { Abi } from 'abitype';

// Legacy (v1) ABIs
import PredictionMarket from './PredictionMarket.json';
import LiquidityVault from './LiquidityVault.json';
import UMAResolver from './UMAResolver.json';
import CollateralToken from './CollateralToken.json';
import LZResolver from './LZResolver.json';
import LZResolverUmaSide from './LZResolverUmaSide.json';
import LZConditionalTokenResolver from './LZConditionalTokenResolver.json';

// V2 ABIs
import PredictionMarketEscrow from './PredictionMarketEscrow.json';
import PredictionMarketToken from './PredictionMarketToken.json';
import PredictionMarketVault from './PredictionMarketVault.json';
import PythConditionResolver from './PythConditionResolver.json';
import ManualConditionResolver from './ManualConditionResolver.json';
import LZConditionResolver from './LZConditionResolver.json';
import IConditionResolver from './IConditionResolver.json';

// Legacy exports
export const predictionMarketAbi: Abi = (PredictionMarket as { abi: Abi }).abi;
export const liquidityVaultAbi: Abi = (LiquidityVault as { abi: Abi }).abi;
export const umaResolverAbi: Abi = (UMAResolver as { abi: Abi }).abi;
export const collateralTokenAbi: Abi = (CollateralToken as { abi: Abi }).abi;
export const lzResolverAbi: Abi = (LZResolver as { abi: Abi }).abi;
export const lzResolverUmaSideAbi: Abi = (LZResolverUmaSide as { abi: Abi }).abi;
export const lzConditionalTokenResolverAbi: Abi = LZConditionalTokenResolver as Abi;

// V2 exports
export const predictionMarketEscrowAbi: Abi = (PredictionMarketEscrow as { abi: Abi }).abi;
export const predictionMarketTokenAbi: Abi = (PredictionMarketToken as { abi: Abi }).abi;
export const predictionMarketVaultAbi: Abi = (PredictionMarketVault as { abi: Abi }).abi;
export const pythConditionResolverAbi: Abi = (PythConditionResolver as { abi: Abi }).abi;
export const manualConditionResolverAbi: Abi = (ManualConditionResolver as { abi: Abi }).abi;
export const lzConditionResolverAbi: Abi = (LZConditionResolver as { abi: Abi }).abi;
export const conditionResolverAbi: Abi = (IConditionResolver as { abi: Abi }).abi;