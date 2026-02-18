import type { Abi } from 'abitype';
import sapience from '../../protocol/deployments/Sapience.json';

// Keep hook API to make it a pure move
export const useSapienceAbi = (): { abi: Abi } => {
  const abi: Abi = sapience.abi as Abi;
  return { abi };
};


