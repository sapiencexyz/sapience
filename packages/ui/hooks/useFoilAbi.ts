import type { Abi } from 'abitype';
import foil from '../../protocol/deployments/Foil.json';

export const useFoilAbi = () => {
  const abi: Abi = foil.abi as Abi;

  return { abi };
};
