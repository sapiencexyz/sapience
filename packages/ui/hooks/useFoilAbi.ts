import { useEffect, useState } from 'react';

export const useFoilAbi = (chainId?: number) => {
  const [abi, setAbi] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    const loadFoilData = async () => {
      try {
        const foil: { abi: any[] } = await import(
          `@/protocol/deployments/outputs/${chainId}/FoilYin.json`
        );
        setAbi(foil.abi);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    if (chainId) {
      loadFoilData();
    }
  }, [chainId]);

  return { abi, loading, error };
};
