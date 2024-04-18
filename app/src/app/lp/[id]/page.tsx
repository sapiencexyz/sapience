'use client';

import { Flex, Heading, Link } from '@chakra-ui/react';
import * as Chains from 'viem/chains';
import { useReadContract } from 'wagmi';

import CollateralAssetAbi from '../app/deployments/CollateralAsset/MintableToken.json';
import LiquidityPositions from '~/lib/components/foil/liquidityPositions';

const Market = ({ params }: { params: { id: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3');
  const chain = Object.entries(Chains).find((chain) => chain[1].id == chainId);

  const { data: balance } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'balanceOf',
    args: ['0x03A71968491d55603FFe1b11A9e23eF013f75bCF'],
  });

  const collateralTicker = 'cbETH';

  return (
    <Flex
      direction="column"
      alignItems="left"
      minHeight="70vh"
      mb={8}
      w="full"
      py={8}
    >
      <Heading mb={3}>
        Provide {collateralTicker} Liquidity for {chain[1].name} Gas
      </Heading>
      <Heading mb={5} fontWeight="normal" size="sm" color="gray.500">
        Market Address:{' '}
        <Link
          isExternal
          borderBottom="1px dotted"
          _hover={{ textDecoration: 'none' }}
          href={`${chain[1].blockExplorers.default.url}/address/${marketAddress}`}
        >
          {marketAddress}
        </Link>
      </Heading>
      <LiquidityPositions />
    </Flex>
  );
};

export default Market;
