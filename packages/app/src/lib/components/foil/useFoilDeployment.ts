import { useEffect, useState } from 'react';

const useFoilDeployment = (chainId?: number) => {
  const [foilData, setFoilData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadFoilData = async () => {
      try {
        const foil = await import(
          `../../../../deployments/${chainId}/Foil.json`
        );
        setFoilData(foil);
      } catch (err) {
        setError(err as any);
      } finally {
        setLoading(false);
      }
    };

    if (chainId) {
      loadFoilData();
    }
  }, [chainId]);

  return { foilData, loading, error };
};

export default useFoilDeployment;
