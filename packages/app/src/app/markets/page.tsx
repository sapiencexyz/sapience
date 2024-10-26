import { Container, Heading } from '@chakra-ui/react';

import MarketsTable from '~/lib/components/foil/marketsTable';

const Market = () => {
  return (
    <Container my={8} maxWidth="container.xl">
      <Heading>Foil Markets</Heading>
      <MarketsTable />
    </Container>
  );
};

export default Market;
