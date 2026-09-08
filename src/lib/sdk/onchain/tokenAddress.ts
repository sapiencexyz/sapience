import {
  encodeAbiParameters,
  keccak256,
  getCreate2Address,
  getContractAddress,
  type Address,
  type Hex,
} from 'viem';
import { predictionMarketTokenFactory } from '../contracts/addresses';
import { computePickConfigId } from '../auction/escrowEncoding';

// Re-export for convenience
export { computePickConfigId };

/**
 * Solady CREATE3 proxy init code hash.
 * See: https://github.com/vectorized/solady/blob/main/src/utils/CREATE3.sol
 */
const PROXY_INITCODE_HASH: Hex =
  '0x21c35dbe1b344a2488cf3321d6ce542f8e9f305544ff09e4993a62319a497c1f';

/**
 * Compute the CREATE3 salt for a token deployment.
 * Mirrors `PredictionMarketTokenFactory.computeSalt`.
 *
 *   salt = keccak256(abi.encode(pickConfigId, isPredictorToken))
 */
export function computeTokenSalt(
  pickConfigId: Hex,
  isPredictorToken: boolean
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bool' }],
      [pickConfigId, isPredictorToken]
    )
  );
}

/**
 * Predict the deterministic token address via CREATE3.
 * Mirrors `PredictionMarketTokenFactory.predictAddress`.
 *
 * No RPC call required — pure computation.
 */
export function predictTokenAddress(
  pickConfigId: Hex,
  isPredictorToken: boolean,
  factoryAddress: Address
): Address {
  const salt = computeTokenSalt(pickConfigId, isPredictorToken);

  // Step 1: CREATE2 proxy address
  const proxyAddress = getCreate2Address({
    from: factoryAddress,
    salt,
    bytecodeHash: PROXY_INITCODE_HASH,
  });

  // Step 2: CREATE from proxy (nonce 1)
  return getContractAddress({
    from: proxyAddress,
    opcode: 'CREATE',
    nonce: 1n,
  });
}

/**
 * Predict both predictor and counterparty token addresses for a pickConfigId.
 */
export function predictTokenPair(
  pickConfigId: Hex,
  factoryAddress: Address
): { predictorToken: Address; counterpartyToken: Address } {
  return {
    predictorToken: predictTokenAddress(pickConfigId, true, factoryAddress),
    counterpartyToken: predictTokenAddress(pickConfigId, false, factoryAddress),
  };
}

/**
 * Get the token factory address for a chain.
 */
export function getTokenFactoryAddress(chainId: number): Address | undefined {
  return predictionMarketTokenFactory[chainId]?.address as Address | undefined;
}
