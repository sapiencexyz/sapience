import { AddIcon, EditIcon, CloseIcon } from '@chakra-ui/icons';
import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Box,
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  useDisclosure,
  Text,
} from '@chakra-ui/react';
import { useState } from 'react';
import { type BaseError, useReadContract } from 'wagmi';

import LiquidityPosition from './liquidityPosition';

export default function LiquidityPositions() {
  const {
    data: balance,
    error,
    isPending,
  } = useReadContract({
    address: '0xFBA391',
    abi: [],
    functionName: 'balanceOf',
    args: ['0x03A71968491d55603FFe1b11A9e23eF013f75bCF'],
  });

  /*

  if (isPending) return <div>Loading...</div>;

  if (error)
    return (
      <div>Error: {(error as BaseError).shortMessage || error.message}</div>
    );
*/

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [mode, setMode] = useState(null);
  const [selectedData, setSelectedData] = useState(null);

  const tableData = [
    {
      id: 1,
      collateral: '12',
      lowPrice: '50',
      highPrice: '50',
      netPosition: '+50',
    },
    // Add more entries as needed
  ];

  const handleCreateClick = () => {
    setMode('create');
    setSelectedData(null);
    onOpen();
  };

  const handleEditClick = (id) => {
    const data = tableData.find((item) => item.id === id);
    setMode('edit');
    setSelectedData(data);
    onOpen();
  };

  return (
    <>
      <TableContainer mb={4}>
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>ID</Th>
              <Th>Collateral</Th>
              <Th>Low Price</Th>
              <Th>High Price</Th>
              <Th>Net Position</Th>
              <Th isNumeric />
            </Tr>
          </Thead>
          <Tbody>
            {tableData.map((row) => (
              <Tr key={row.id}>
                <Td>{row.id}</Td>
                <Td>
                  {row.collateral}{' '}
                  <Text fontSize="sm" color="gray.500">
                    cbETH
                  </Text>
                </Td>
                <Td>
                  {row.lowPrice}{' '}
                  <Text fontSize="sm" color="gray.500">
                    cbETH/Ggas
                  </Text>
                </Td>
                <Td>
                  {row.highPrice}{' '}
                  <Text fontSize="sm" color="gray.500">
                    cbETH/Ggas
                  </Text>
                </Td>
                <Td>
                  {row.netPosition}
                  <Text fontSize="sm" color="gray.500">
                    Gigagas
                  </Text>
                </Td>
                <Td isNumeric>
                  <Button
                    onClick={() => handleEditClick(row.id)}
                    variant="ghost"
                  >
                    <EditIcon />
                  </Button>
                  <Button
                    onClick={() => handleEditClick(row.id)}
                    variant="ghost"
                  >
                    <CloseIcon />
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Box>
        <Button
          colorScheme="green"
          leftIcon={<AddIcon />}
          onClick={handleCreateClick}
        >
          Create
        </Button>
      </Box>
      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {mode === 'create'
              ? 'Create New Liquidity Position'
              : 'Edit Liquidity Position'}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <LiquidityPosition mode={mode} data={selectedData} />
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
