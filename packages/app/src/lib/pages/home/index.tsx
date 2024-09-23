/* eslint-disable import/no-extraneous-dependencies */

'use client';

import FoilTestnet from '@/protocol/deployments/11155111/Foil.json';
import { Flex, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const Home = () => {
  const router = useRouter();

  useEffect(() => {
    router.push(`/markets/11155111:${FoilTestnet.address}/epochs/1`);
  }, [router]);

  return (
    <Flex direction="column" alignItems="center" gap={4} w="full">
      <Text size="lg" my="auto" opacity="0.33" fontStyle="italic">
        Redirecting...
      </Text>
    </Flex>
  );
};

export default Home;
