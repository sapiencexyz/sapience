import {
  IconButton,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  Image,
  Box,
} from '@chakra-ui/react';
import { RiArrowRightUpLine } from 'react-icons/ri';
import Link from 'next/link';

const Home = () => {
  return (
    <Flex
      direction="column"
      alignItems="center"
      minHeight="70vh"
      gap={4}
      mb={8}
      w="full"
    >
      <TableContainer width="100%">
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>Gas Market</Th>
              <Th>Expiration</Th>
              <Th>Current Price</Th>
              <Th isNumeric />
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td>
                <Flex alignItems="center">
                  <Image src="assets/ethereum.svg" height="48px" mr={3} />
                  <Box>
                    Ethereum Mainnet
                    <Text fontSize="sm" color="gray.500">wstETH collateral</Text>
                  </Box>
                </Flex>
              </Td>
              <Td>
                March 1st, 2024
                <Text fontSize="sm" color="gray.500">in 14 days</Text>
              </Td>
              <Td>25 gwei
                <Text fontSize="sm" color="gray.500">22 gwei 30-day trailing avg.</Text></Td>
              <Td isNumeric>
                <IconButton aria-label="view" icon={<RiArrowRightUpLine />} as={Link} href="/markets" />
              </Td>
            </Tr>
            <Tr>
              <Td>
                <Flex alignItems="center">
                  <Image src="assets/celestia.png" height="48px" mr={3} />
                  <Box>
                    Celestia Blobspace
                    <Text fontSize="sm" color="gray.500">TIA collateral</Text>
                  </Box>
                </Flex>
              </Td>
              <Td>
                March 1st, 2024
                <Text fontSize="sm" color="gray.500">in 14 days</Text>
              </Td>
              <Td>15 µtia
                <Text fontSize="sm" color="gray.500">17 µtia 30-day trailing avg.</Text></Td>
              <Td isNumeric>
                <IconButton aria-label="view" icon={<RiArrowRightUpLine />} as={Link} href="/markets" />
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </TableContainer>
    </Flex>
  );
};

export default Home;
