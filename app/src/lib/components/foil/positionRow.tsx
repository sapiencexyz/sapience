import { Tr, Td, Text, StatNumber, Stat } from '@chakra-ui/react';
import { useReadContract } from 'wagmi';

import Foil from '../../../../deployments/Foil.json';

import PositionEdit from './positionEdit';

export default function PositionRow(row: any) {
  const positionResult = useReadContract({
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getPosition',
    args: [row.id],
  });

  return (
    <Tr height="80px">
      <Td>
        <Stat my={2} pt={1}>
          <StatNumber>{row.id.toString()}
          <Text as="span" fontSize="sm" color="gray.700">
              
            </Text>
          </StatNumber>
        </Stat>
      </Td>
      <Td>
        <Stat my={2} pt={1}>
          <StatNumber>
            100{row.collateral}{' '}
            <Text as="span" fontSize="sm" color="gray.700">
              cbETH
            </Text>
          </StatNumber>
        </Stat>
      </Td>
      <Td>
        <Stat my={2} pt={1}>
        <StatNumber>
            100{row.lowPrice}{' '}
            <Text as="span" fontSize="sm" color="gray.700">
            cbETH/Ggas
            </Text>
          </StatNumber>
          </Stat>
      </Td>
      <Td>
        <Stat my={2} pt={1}>
        <StatNumber>
            100{row.highPrice}{' '}
            <Text as="span" fontSize="sm" color="gray.700">
            cbETH/Ggas
            </Text>
          </StatNumber>
          </Stat>


      </Td>
      <Td>

      <Stat my={2} pt={1}>
        <StatNumber>
            100{row.netPosition}{' '}
            <Text as="span" fontSize="sm" color="gray.700">
            Gigagas
            </Text>
          </StatNumber>
          </Stat>
      </Td>
      <Td>

      <Stat my={2} pt={1}>
        <StatNumber>
            +4{row.gainLoss}{' '}
            <Text as="span" fontSize="sm" color="gray.700">
            cbETH
            </Text>
          </StatNumber>
          </Stat>
      </Td>
      <Td isNumeric>
        <PositionEdit id={row.id} />
      </Td>
    </Tr>
  );
}
