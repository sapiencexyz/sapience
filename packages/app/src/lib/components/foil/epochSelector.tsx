import { ArrowUpDownIcon } from '@chakra-ui/icons';
import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  Text,
  Flex,
  Box,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useContext, useState } from 'react';

import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketContext } from '~/lib/context/MarketProvider';

const EpochSelector: React.FC = () => {
  const { chain, address, epoch } = useContext(MarketContext);
  const { markets } = useMarketList();
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleOpen = () => setIsOpen(true);
  const handleClose = () => setIsOpen(false);

  const currentMarket = markets.find(
    (market) => market.address === address && market.chainId === chain?.id
  );

  const handleEpochSelect = (selectedEpoch: number) => {
    router.push(`/markets/${chain?.id}:${address}/epochs/${selectedEpoch}`);
    handleClose();
  };

  const formatDate = (timestamp: number) => {
    return format(new Date(timestamp * 1000), 'MMM d, yyyy');
  };

  return (
    <>
      <Button onClick={handleOpen} ml={4} size="xs">
        Epoch {epoch}
        <ArrowUpDownIcon ml={0.5} h={2} />
      </Button>

      <Modal isOpen={isOpen} onClose={handleClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Select Epoch</ModalHeader>
          <ModalCloseButton />
          <ModalBody pt={0} pb={6}>
            <VStack spacing={2} align="stretch">
              {currentMarket?.epochs.map((epochData) => (
                <Flex
                  key={epochData.id}
                  justifyContent="space-between"
                  alignItems="center"
                  py={2}
                  px={4}
                  bg={epochData.epochId === epoch ? 'gray.100' : 'transparent'}
                  borderRadius="md"
                  cursor="pointer"
                  onClick={() => handleEpochSelect(epochData.epochId)}
                  _hover={{ bg: 'gray.50' }}
                >
                  <Text fontWeight="bold">Epoch {epochData.epochId}</Text>
                  <Box>
                    <Text fontSize="sm" color="gray.600">
                      {formatDate(epochData.startTimestamp)} -{' '}
                      {formatDate(epochData.endTimestamp)}
                    </Text>
                  </Box>
                </Flex>
              ))}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default EpochSelector;
