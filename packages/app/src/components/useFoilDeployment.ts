import { useEffect, useState } from 'react';

export type VaultType = 'yin' | 'yang' | 'yinBlob' | 'yangBlob';

const useFoilDeployment = (chainId?: number) => {
  const [foilData, setFoilData] = useState<any>({});
  const [foilVaultData, setFoilVaultData] = useState<Record<VaultType, any>>({
    yin: {},
    yang: {},
    yinBlob: {},
    yangBlob: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadFoilData = async () => {
      try {
        const foil = await import(`@/protocol/deployments/Foil.json`);
        setFoilData(foil);
      } catch (err) {
        console.log('ERROR', err);
        setError(err as any);
      }

      try {
        const vault = await import(`@/protocol/deployments/FoilVault.json`);

        setFoilVaultData({
          yin: vault,
          yang: vault,
          yinBlob: vault,
          yangBlob: vault,
        });
      } catch (err) {
        setError(err as any);
      } finally {
        setLoading(false);
      }
    };

    loadFoilData();
  }, [chainId]);

  return { foilData, loading, error, foilVaultData };
};

export default useFoilDeployment;
