export const parseContractId = (
  contractId: string
): { chainId: string; address: string } => {
  const [chainId, address] = contractId.toLowerCase().split(':');
  if (!chainId || !address) {
    throw new Error('Invalid contractId format');
  }
  return { chainId, address };
};
