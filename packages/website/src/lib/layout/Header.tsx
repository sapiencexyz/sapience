import { Button, Flex, Image } from '@chakra-ui/react';

const Header = () => {
  return (
    <Flex
      as="header"
      width="full"
      align="center"
      p={3}
      zIndex={3}
      position="fixed"
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.200"
    >
      <Image src="/logo.svg" alt="Foil" height="28px" />
      <Button
        px={3.5}
        size="sm"
        as="a"
        marginLeft="auto"
        colorScheme="blackAlpha"
        bg="black"
        _hover={{ bg: 'blackAlpha.800' }}
        href="https://twitter.com/foilxyz"
        letterSpacing="0.05rem"
        pt={0.5}
        fontWeight={500}
      >
        @foilxyz
      </Button>
    </Flex>
  );
};

export default Header;
