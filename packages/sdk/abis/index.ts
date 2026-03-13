import type { Abi } from 'abitype';

// Deprecated ABIs
import PredictionMarket from './PredictionMarket.json';
import LiquidityVault from './LiquidityVault.json';
import UMAResolver from './UMAResolver.json';
import CollateralToken from './CollateralToken.json';
import LZResolver from './LZResolver.json';
import LZResolverUmaSide from './LZResolverUmaSide.json';
import LZConditionalTokenResolver from './LZConditionalTokenResolver.json';

// Escrow ABIs
import PredictionMarketEscrow from './PredictionMarketEscrow.json';
import PredictionMarketToken from './PredictionMarketToken.json';
import PredictionMarketVault from './PredictionMarketVault.json';
import PythConditionResolver from './PythConditionResolver.json';
import ManualConditionResolver from './ManualConditionResolver.json';
import LZConditionResolver from './LZConditionResolver.json';
import IConditionResolver from './IConditionResolver.json';
import PredictionMarketBridge from './PredictionMarketBridge.json';
import PredictionMarketBridgeRemote from './PredictionMarketBridgeRemote.json';
import PredictionMarketTokenFactory from './PredictionMarketTokenFactory.json';
import SecondaryMarketEscrow from './SecondaryMarketEscrow.json';
import OnboardingSponsor from './OnboardingSponsor.json';

// Deprecated — use escrow equivalents

/** @deprecated Use `predictionMarketEscrowAbi` */
export const predictionMarketAbi: Abi = (PredictionMarket as { abi: Abi }).abi;

/** @deprecated Use `predictionMarketVaultAbi` */
export const liquidityVaultAbi: Abi = (LiquidityVault as { abi: Abi }).abi;

/** @deprecated Use `lzConditionResolverAbi` */
export const umaResolverAbi: Abi = (UMAResolver as { abi: Abi }).abi;

export const collateralTokenAbi: Abi = (CollateralToken as { abi: Abi }).abi;

/** @deprecated Use `lzConditionResolverAbi` */
export const lzResolverAbi: Abi = (LZResolver as { abi: Abi }).abi;

/** @deprecated Use `lzConditionResolverAbi` */
export const lzResolverUmaSideAbi: Abi = (LZResolverUmaSide as { abi: Abi })
  .abi;

/** @deprecated Use `lzConditionResolverAbi` */
export const lzConditionalTokenResolverAbi: Abi =
  LZConditionalTokenResolver as Abi;
export const predictionMarketEscrowAbi = PredictionMarketEscrow as Abi;
export const predictionMarketTokenAbi = PredictionMarketToken as Abi;
export const predictionMarketVaultAbi = PredictionMarketVault as Abi;
export const pythConditionResolverAbi = PythConditionResolver as Abi;
export const manualConditionResolverAbi = ManualConditionResolver as Abi;
export const lzConditionResolverAbi = LZConditionResolver as Abi;
export const conditionResolverAbi = IConditionResolver as Abi;
export const predictionMarketBridgeAbi = PredictionMarketBridge as Abi;
export const predictionMarketBridgeRemoteAbi =
  PredictionMarketBridgeRemote as Abi;
export const predictionMarketTokenFactoryAbi =
  PredictionMarketTokenFactory as Abi;
export const secondaryMarketEscrowAbi = SecondaryMarketEscrow as Abi;
export const onboardingSponsorAbi = OnboardingSponsor as Abi;
