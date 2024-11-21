import { useEffect, useState } from 'react';

const useFoilDeployment = (chainId?: number) => {
  const [foilData, setFoilData] = useState<any>({});
  const [foilVaultData, setFoilVaultData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadFoilData = async () => {
      try {
        const foil = await import(
          `@/protocol/deployments/${chainId}/FoilYin.json`
        );
        const foilVault = await import(
          `@/protocol/deployments/${chainId}/Vault1.json`
        );
        setFoilData(foil);
        setFoilVaultData(foilVault);
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

  return { foilData, loading, error, foilVaultData };
};

export default useFoilDeployment;
