import { EditIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  VStack,
  useDisclosure,
  Flex,
} from '@chakra-ui/react';
import type React from 'react';

import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';

const PositionSelector: React.FC<{ isLP?: boolean | null }> = ({ isLP }) => {
  const { nftId, positions, setNftId } = useAddEditPosition();
  const { isOpen, onOpen, onClose } = useDisclosure();

  let filteredPositions;
  if (isLP === true) {
    filteredPositions = positions?.liquidityPositions;
  } else if (isLP === false) {
    filteredPositions = positions?.tradePositions;
  } else {
    filteredPositions = [
      ...(positions?.liquidityPositions || []),
      ...(positions?.tradePositions || []),
    ];
  }

  const handlePositionSelect = (selectedNftId: number) => {
    setNftId(selectedNftId);
    onClose();
  };

  // Helper function to get position type text
  const getPositionTypeText = () => {
    if (isLP === true) return 'Liquidity Position';
    if (isLP === false) return 'Trader Position';
    return 'Position';
  };

  return (
    <Box>
      <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
        Position
      </Text>
      <Text fontSize="sm" color="gray.600">
        {nftId ? `#${nftId}` : 'New Position'}{' '}
        <Button
          variant="unstyled"
          display="inline"
          ml={0.5}
          color="blue.400"
          onClick={onOpen}
          minW="auto"
          h="auto"
          p={0}
        >
          <EditIcon transform="translateY(-1.5px)" />
        </Button>
      </Text>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Select {getPositionTypeText()}</ModalHeader>
          <ModalBody pb={6}>
            <VStack spacing={2} align="stretch">
              {filteredPositions?.map((position) => (
                <Flex
                  key={Number(position.id)}
                  justifyContent="space-between"
                  alignItems="center"
                  py={2}
                  px={4}
                  bg={
                    Number(position.id) === nftId ? 'gray.100' : 'transparent'
                  }
                  borderRadius="md"
                  cursor="pointer"
                  onClick={() => handlePositionSelect(Number(position.id))}
                  _hover={{ bg: 'gray.50' }}
                >
                  <Text fontWeight="bold">#{Number(position.id)}</Text>
                </Flex>
              ))}
              <Flex
                justifyContent="space-between"
                alignItems="center"
                py={2}
                px={4}
                bg={nftId === 0 ? 'gray.100' : 'transparent'}
                borderRadius="md"
                cursor="pointer"
                onClick={() => handlePositionSelect(0)}
                _hover={{ bg: 'gray.50' }}
              >
                <Text fontWeight="bold">New Position</Text>
              </Flex>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default PositionSelector;
