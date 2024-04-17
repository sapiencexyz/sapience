import {
  TableContainer,
  Table,
  TableCaption,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@chakra-ui/react';
import { type BaseError, useReadContract } from 'wagmi';

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

  if (isPending) return <div>Loading...</div>;

  if (error)
    return (
      <div>Error: {(error as BaseError).shortMessage || error.message}</div>
    );

  return (
    <TableContainer>
      <div>Balance: {balance?.toString()}</div>;
      <Table variant="simple">
        <TableCaption>Imperial to metric conversion factors</TableCaption>
        <Thead>
          <Tr>
            <Th>Liquidity Position ID</Th>
            <Th>Collateral</Th>
            <Th>Low Price</Th>
            <Th>High Price</Th>
            <Th isNumeric />
          </Tr>
        </Thead>
        <Tbody>
          <Tr>
            <Td>1</Td>
            <Td>12</Td>
            <Td>300</Td>
            <Td>
              <EditIcon />
            </Td>
          </Tr>
        </Tbody>
      </Table>
    </TableContainer>
  );
}
