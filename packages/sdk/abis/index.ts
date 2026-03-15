import type { Abi } from 'abitype';

import CollateralToken from './CollateralToken.json';

// Escrow ABIs
import PredictionMarketEscrow from './PredictionMarketEscrow.json';
import PredictionMarketToken from './PredictionMarketToken.json';
import PredictionMarketVault from './PredictionMarketVault.json';
import PythConditionResolver from './PythConditionResolver.json';
import ManualConditionResolver from './ManualConditionResolver.json';
import IConditionResolver from './IConditionResolver.json';
import PredictionMarketBridge from './PredictionMarketBridge.json';
import PredictionMarketBridgeRemote from './PredictionMarketBridgeRemote.json';
import PredictionMarketTokenFactory from './PredictionMarketTokenFactory.json';
import SecondaryMarketEscrow from './SecondaryMarketEscrow.json';
import OnboardingSponsor from './OnboardingSponsor.json';

export const collateralTokenAbi: Abi = (CollateralToken as { abi: Abi }).abi;

export const predictionMarketEscrowAbi = PredictionMarketEscrow as Abi;
export const predictionMarketTokenAbi = PredictionMarketToken as Abi;
export const predictionMarketVaultAbi = PredictionMarketVault as Abi;
export const pythConditionResolverAbi = PythConditionResolver as Abi;
export const manualConditionResolverAbi = ManualConditionResolver as Abi;
export const conditionResolverAbi = IConditionResolver as Abi;
export const predictionMarketBridgeAbi = PredictionMarketBridge as Abi;
export const predictionMarketBridgeRemoteAbi =
  PredictionMarketBridgeRemote as Abi;
export const predictionMarketTokenFactoryAbi =
  PredictionMarketTokenFactory as Abi;
export const secondaryMarketEscrowAbi = SecondaryMarketEscrow as Abi;
export const onboardingSponsorAbi = OnboardingSponsor as Abi;
