import { useEffect, useState } from 'react';

const useFoilDeployment = (chainId?: number) => {
  const [foilData, setFoilData] = useState<any>({});
  const [foilVaultData, setFoilVaultData] = useState<{ yin: any; yang: any }>({
    yin: {},
    yang: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadFoilData = async () => {
      try {
        const foil = await import(
          `@/protocol/deployments/${chainId}/FoilYin.json`
        );
        const foilYinVault = await import(
          `@/protocol/deployments/${chainId}/VaultYin.json`
        );
        const foilYangVault = await import(
          `@/protocol/deployments/${chainId}/VaultYang.json`
        );
        setFoilData(foil);
        setFoilVaultData({
          yin: foilYinVault,
          yang: foilYangVault,
        });
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
