import { AddIcon, EditIcon, CloseIcon } from '@chakra-ui/icons';
import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Box,
  Heading,
} from '@chakra-ui/react';
import { useState } from 'react';

import PositionRow from './positionRow';
import CreateAccount from './createAccount';
// import { type BaseError, useReadContract } from 'wagmi';

export default function Positions() {
  
  const ids = [1, 2, 420];

  // totalSupply
  // tokenByIndex

  return (
    <Box>
      <Heading size="md" mb="2">Positions</Heading>
      <TableContainer mb={6}>
        <Table variant="simple" size="sm">
          <Thead>
            <Tr>
              <Th>ID</Th>
              <Th>Collateral</Th>
              <Th>Low Price</Th>
              <Th>High Price</Th>
              <Th>Net Position</Th>
              <Th>Gain/Loss</Th>
              <Th isNumeric />
            </Tr>
          </Thead>
          <Tbody>
            {ids.map((id) => (
              <PositionRow key={id} id={id} />
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Box mb={4} maxW="270px">
        <CreateAccount />
      </Box>
    </Box>
  );
}
