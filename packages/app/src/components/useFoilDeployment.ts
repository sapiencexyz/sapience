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
        const foil = await import(
          `@/protocol/deployments/outputs/${chainId}/FoilYin.json`
        );
        setFoilData(foil);
      } catch (err) {
        console.log('ERROR', err);
        setError(err as any);
      }

      try {
        const foilYinVault = await import(
          `@/protocol/deployments/outputs/${chainId}/VaultYin.json`
        );
        const foilYangVault = await import(
          `@/protocol/deployments/outputs/${chainId}/VaultYang.json`
        );
        const foilYinBlobVault = await import(
          `@/protocol/deployments/outputs/${chainId}-blobs/VaultYin.json`
        );
        const foilYangBlobVault = await import(
          `@/protocol/deployments/outputs/${chainId}-blobs/VaultYang.json`
        );
        setFoilVaultData({
          yin: foilYinVault,
          yang: foilYangVault,
          yinBlob: foilYinBlobVault,
          yangBlob: foilYangBlobVault,
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
